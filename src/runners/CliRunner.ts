import chalk from 'chalk';
import { container } from 'tsyringe';
import { ConfigService } from '../services/ConfigService';
import { LoggerService } from '../services/LoggerService';
import { StateService } from '../services/StateService';
import { RedditApiService } from '../services/RedditApiService';
import { FileSystemService } from '../services/FileSystemService';
import { DatabaseService } from '../services/DatabaseService';
import { DownloadManager } from '../services/download/DownloadManager';
import { DownloadOrchestrator } from '../services/DownloadOrchestrator';
import { MediaDownloader } from '../services/download/MediaDownloader';
import { PhashService } from '../services/PhashService';
// import { TextDownloader } from '../services/download/TextDownloader';
// import { LinkDownloader } from '../services/download/LinkDownloader';
import { GalleryDownloader } from '../services/download/GalleryDownloader';
import { YouTubeDownloader } from '../services/download/YouTubeDownloader';
import { RedgifsDownloader } from '../services/download/RedgifsDownloader';
import { promptForSettings } from '../utils/prompts';
import { ALL_POSTS, MAX_POSTS_PER_REQUEST, DATA_DIR } from '../config/constants';
import { getFileName } from '../utils/filenameUtils';
import { isUserProfile, extractName } from '../utils/postUtils';
import { CONFIG_TOKEN } from '../config/tokens';
import { Runner } from './Runner';
import { Config, RedditPost } from '../types';
import * as path from 'path';

const version = require('../../package.json').version;

export class CliRunner implements Runner {
  async run(): Promise<void> {
    // Check for special CLI commands first
    const args = process.argv.slice(2);

    // 1. Load Config & Register
    const config = ConfigService.load();

    container.register(CONFIG_TOKEN, { useValue: config });

    // 2. Resolve Services
    const loggerService = container.resolve(LoggerService);
    const configService = container.resolve(ConfigService);
    const dbService = container.resolve(DatabaseService);

    // Reload config from DB if available
    const dbConfig = await configService.getConfig();
    Object.assign(config, dbConfig);
    const validation = ConfigService.validate(config);

    const state = container.resolve(StateService);
    const apiService = container.resolve(RedditApiService);
    const fsService = container.resolve(FileSystemService);
    const downloadManager = container.resolve(DownloadManager);
    const orchestrator = container.resolve(DownloadOrchestrator);
    const phashService = container.resolve(PhashService);

    // Check for special commands before normal operation
    // Handle --find-duplicates command
    const findDuplicatesArg = args.find(arg => arg.startsWith('--find-duplicates'));
    if (findDuplicatesArg) {
      await this.handleFindDuplicates(phashService, loggerService, findDuplicatesArg);
      dbService.close();
      return;
    }

    // Handle --generate-phash command
    if (args.includes('--generate-phash')) {
      await this.handleGeneratePhash(phashService, dbService, loggerService, fsService);
      dbService.close();
      return;
    }

    // 2.5 Configure API rate limiting and logging
    if (config.rate_limit_delay_ms !== undefined) {
      apiService.setMinRequestDelay(config.rate_limit_delay_ms);
      loggerService.log(`Rate limit delay set to ${config.rate_limit_delay_ms}ms`, true);
    }
    // Connect API service logging to main logger
    apiService.setLogger((msg) => loggerService.log(msg, true));

    // 3. Logger Setup
    loggerService.logWelcome();
    loggerService.logValidation(validation);

    if (!validation.valid) {
      process.exit(1);
    }

    loggerService.log('User config: ' + JSON.stringify(config), true);
    if (config.testingMode) {
      loggerService.log('Testing mode options: ' + JSON.stringify(config.testingModeOptions), true);
      state.initFromTestingMode();
    }

    // 4. Update Check
    const latestVersion = await apiService.checkUpdates();
    if (latestVersion) {
      loggerService.logVersionInfo(version, latestVersion);
    }

    // 5. Setup Downloaders (order matters - first match wins)
    downloadManager.registerDownloader(container.resolve(GalleryDownloader));
    //downloadManager.registerDownloader(container.resolve(TextDownloader));
    downloadManager.registerDownloader(container.resolve(YouTubeDownloader));
    downloadManager.registerDownloader(container.resolve(RedgifsDownloader)); // Before MediaDownloader
    //downloadManager.registerDownloader(container.resolve(LinkDownloader));
    downloadManager.registerDownloader(container.resolve(MediaDownloader));

    // 6. Logic
    await this.startLogic(config, state, apiService, loggerService, orchestrator);

    // Cleanup
    dbService.close();
  }

  private async startLogic(
    config: Config,
    state: StateService,
    apiService: RedditApiService,
    loggerService: LoggerService,
    orchestrator: DownloadOrchestrator
  ) {
    async function downloadSubredditBatch(target: string, lastPostId: string = '') {
      try {
        await orchestrator.downloadBatch({
            target,
            logger: loggerService,
            options:  { delayBetweenPosts: 250 },
            lastPostId
        });

        // Log progress after each post (handled inside the orchestrator now)
        const [, downloaded] = state.getPostsRemaining();
        const total = state.numberOfPosts >= ALL_POSTS ? 'all' : state.numberOfPosts;
        loggerService.log(`Still downloading posts from ${chalk.cyan(state.getCurrentSubreddit())}... (${downloaded}/${total})`, false);

        handleDownloadComplete();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        loggerService.log(`ERROR: ${message}`, true);
        handleDownloadComplete();
      }
    }

    function handleDownloadComplete() {
      const endTime = new Date();
      const startTime = state.startTime || new Date();
      
      loggerService.log(`🎉 All done downloading posts from ${state.getCurrentSubreddit()}!`, false);
      loggerService.log(`Stats: ${JSON.stringify(state.downloadedPosts)}`, true);
      
      state.resetDownloadStats();

      if (state.nextSubreddit()) {
        downloadSubredditBatch(state.getCurrentSubreddit());
      } else if (state.repeatForever) {
        state.resetSubredditIndex();
        loggerService.log(`⏲️ Waiting ${state.timeBetweenRuns / 1000} seconds before rerunning...`, false);
        setTimeout(() => {
          state.startTime = new Date();
          downloadSubredditBatch(state.getCurrentSubreddit());
        }, state.timeBetweenRuns);
      } else {
         start();
      }
    }

    async function start() {
      if (config.testingMode) {
        state.startTime = new Date();
        await downloadSubredditBatch(state.getCurrentSubreddit());
      } else {
        const answers = await promptForSettings();
        if (state.initFromPrompts(answers)) {
          await downloadSubredditBatch(state.getCurrentSubreddit());
        } else {
          loggerService.log('Goodbye!', false);
          process.exit(0);
        }
      }
    }

    await start();
  }

  /**
   * Handle --find-duplicates command
   */
  private async handleFindDuplicates(
    phashService: PhashService,
    loggerService: LoggerService,
    arg: string
  ): Promise<void> {
    // Parse threshold from argument (e.g., --find-duplicates=8)
    let threshold = 5; // Default
    if (arg.includes('=')) {
      const thresholdStr = arg.split('=')[1];
      const parsed = parseInt(thresholdStr, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        threshold = parsed;
      }
    }

    console.log(chalk.cyan(`\nSearching for duplicates (threshold: ${threshold} bits)...\n`));

    const result = await phashService.findDuplicates(threshold);

    if (result.totalGroups === 0) {
      console.log(chalk.green('No duplicates found!'));
      return;
    }

    console.log(chalk.yellow(`Found ${result.totalGroups} duplicate groups (${result.totalDuplicates} files total):\n`));

    result.groups.forEach((group, index) => {
      const groupNum = index + 1;
      const typeLabel = group.type === 'video' ? '📹' : group.type === 'image' ? '🖼️' : '📁';

      console.log(chalk.bold(`${typeLabel} Group ${groupNum} (${group.files.length} files, avg distance: ${group.avgDistance} bits):`));

      if (group.confidence !== undefined) {
        const confidencePercent = Math.round(group.confidence * 100);
        console.log(chalk.gray(`  Confidence: ${confidencePercent}% match`));
      }

      group.files.forEach(file => {
        console.log(`  - ${chalk.cyan(file.path)} (Post: ${file.post_id})`);
        console.log(`    ${chalk.gray(file.url)}`);
      });

      console.log(''); // Empty line between groups
    });

    console.log(chalk.green(`\nTotal: ${result.totalGroups} duplicate groups found`));
  }

  /**
   * Handle --generate-phash command
   */
  private async handleGeneratePhash(
    phashService: PhashService,
    dbService: DatabaseService,
    loggerService: LoggerService,
    fsService: FileSystemService
  ): Promise<void> {
    console.log(chalk.cyan('\nGenerating perceptual hashes for existing downloads...\n'));

    // Get records without phash
    const records = await dbService.getDownloadsWithoutPhash();

    if (records.length === 0) {
      console.log(chalk.green('All files already have perceptual hashes!'));
      return;
    }

    console.log(`Found ${records.length} files without phash. Processing...\n`);

    let processed = 0;
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    const downloadsDir = path.join(DATA_DIR, 'downloads');

    for (const record of records) {
      const fullPath = path.join(downloadsDir, record.path);
      processed++;

      // Show progress every 10 files
      if (processed % 10 === 0 || processed === records.length) {
        process.stdout.write(`\rProgress: ${processed}/${records.length} files...`);
      }

      // Check if file exists
      if (!fsService.fileExists(fullPath)) {
        skipped++;
        loggerService.log(`Skipping ${record.filename} (file not found)`, true);
        continue;
      }

      // Generate phash
      try {
        const phash = await phashService.generatePhash(fullPath);

        if (phash) {
          const phashStr = Array.isArray(phash) ? JSON.stringify(phash) : phash;
          await dbService.updatePhash(record.id, phashStr);
          generated++;
        } else {
          failed++;
        }
      } catch (error: any) {
        loggerService.log(`Failed to generate phash for ${record.filename}: ${error.message}`, true);
        failed++;
      }
    }

    console.log('\n'); // New line after progress
    console.log(chalk.green(`\nCompleted:`));
    console.log(`  Generated: ${chalk.cyan(generated.toString())}`);
    console.log(`  Skipped (not found): ${chalk.yellow(skipped.toString())}`);
    console.log(`  Failed: ${chalk.red(failed.toString())}`);
    console.log(`  Total processed: ${processed}`);
  }
}
