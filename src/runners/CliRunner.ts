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
import { TextDownloader } from '../services/download/TextDownloader';
import { LinkDownloader } from '../services/download/LinkDownloader';
import { GalleryDownloader } from '../services/download/GalleryDownloader';
import { YouTubeDownloader } from '../services/download/YouTubeDownloader';
import { promptForSettings } from '../utils/prompts';
import { ALL_POSTS, MAX_POSTS_PER_REQUEST } from '../config/constants';
import { getFileName } from '../utils/filenameUtils';
import { isUserProfile, extractName } from '../utils/postUtils';
import { CONFIG_TOKEN } from '../config/tokens';
import { Runner } from './Runner';
import { Config, RedditPost } from '../types';

const version = require('../../package.json').version;

export class CliRunner implements Runner {
  async run(): Promise<void> {
    // 1. Load Config & Register
    const config = ConfigService.load();
    ConfigService.ensurePostListFile();
    const validation = ConfigService.validate(config);

    container.register(CONFIG_TOKEN, { useValue: config });

    // 2. Resolve Services
    const loggerService = container.resolve(LoggerService);
    const state = container.resolve(StateService);
    const apiService = container.resolve(RedditApiService);
    const fsService = container.resolve(FileSystemService);
    const dbService = container.resolve(DatabaseService);
    const downloadManager = container.resolve(DownloadManager);
    const orchestrator = container.resolve(DownloadOrchestrator);

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

    // 5. Setup Downloaders
    downloadManager.registerDownloader(container.resolve(GalleryDownloader));
    downloadManager.registerDownloader(container.resolve(TextDownloader));
    downloadManager.registerDownloader(container.resolve(YouTubeDownloader));
    downloadManager.registerDownloader(container.resolve(LinkDownloader));
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
        await orchestrator.downloadBatch(target, loggerService, { delayBetweenPosts: 250 }, lastPostId);

        // Log progress after each post (handled inside orchestrator now)
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
      if (config.download_post_list_options.enabled) {
        const urls = ConfigService.readPostListFile();
        state.initFromPostListOptions(urls.length);
        loggerService.log(chalk.green(`Starting download of ${urls.length} posts from list file.`), false);

        for (const url of urls) {
          try {
            const data = await apiService.fetchPost(url);
            const post = data[0].data.children[0].data;
            await orchestrator.downloadPost(post, loggerService);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            loggerService.log(`Failed to download ${url}: ${message}`, true);
          }
        }
        loggerService.log('Finished downloading from post list.', false);
        process.exit(0);

      } else if (config.testingMode) {
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
}
