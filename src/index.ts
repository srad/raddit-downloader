/**
 * Reddit Post Downloader - Main Entry Point
 *
 * A tool to download posts from Reddit subreddits or user profiles.
 * https://github.com/josephrcox/easy-reddit-downloader
 */

import 'reflect-metadata';
import chalk from 'chalk';
import { container } from 'tsyringe';
import { ConfigService } from './services/ConfigService';
import { LoggerService } from './services/LoggerService';
import { StateService } from './services/StateService';
import { RedditApiService } from './services/RedditApiService';
import { FileSystemService } from './services/FileSystemService';
import { DatabaseService } from './services/DatabaseService';
import { DownloadManager } from './services/download/DownloadManager';
import { MediaDownloader } from './services/download/MediaDownloader';
import { TextDownloader } from './services/download/TextDownloader';
import { LinkDownloader } from './services/download/LinkDownloader';
import { GalleryDownloader } from './services/download/GalleryDownloader';
import { YouTubeDownloader } from './services/download/YouTubeDownloader';
import { promptForSettings } from './utils/prompts';
import { ALL_POSTS, MAX_POSTS_PER_REQUEST } from './config/constants';
import { getFileName } from './utils/filenameUtils';
import { isUserProfile, extractName } from './utils/postUtils';
import { CONFIG_TOKEN } from './config/tokens';

// Constants
const version = require('../package.json').version;

async function main() {
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

  // 5. Setup Downloaders (Order matters!)
  // Specialized downloaders first
  downloadManager.registerDownloader(container.resolve(GalleryDownloader));
  downloadManager.registerDownloader(container.resolve(TextDownloader));
  downloadManager.registerDownloader(container.resolve(YouTubeDownloader));
  downloadManager.registerDownloader(container.resolve(LinkDownloader));
  // Generic media downloader last (fallback)
  downloadManager.registerDownloader(container.resolve(MediaDownloader));

  // 6. Workflow Logic
  // Helper to determine directories
  function getDownloadDirectory(subreddit: string, isUser: boolean, isOver18: boolean): string {
    if (isUser) {
      return `${state.downloadDirectoryBase}/user_${subreddit}`;
    }
    const cleanOrNsfw = isOver18 ? 'nsfw' : 'clean';
    return config.separate_clean_nsfw
      ? `${state.downloadDirectoryBase}/${cleanOrNsfw}/${subreddit}`
      : `${state.downloadDirectoryBase}/${subreddit}`;
  }

  async function processPost(post: any) {
    const isOver18 = post.over_18;
    const targetDir = getDownloadDirectory(post.subreddit, isUserProfile(state.getCurrentSubreddit()), isOver18);
    const filenameBase = getFileName(post, config);
    
    fsService.ensureDirectoryExists(targetDir);
    state.downloadDirectory = targetDir; 

    await downloadManager.download(post, targetDir, filenameBase);
  }

  async function downloadSubredditBatch(target: string, lastPostId: string = '') {
    const isUser = isUserProfile(target);
    const name = extractName(target);
    const [postsRemaining] = state.getPostsRemaining();

    if (postsRemaining <= 0) return;

    const limit = Math.min(postsRemaining, MAX_POSTS_PER_REQUEST);

    loggerService.log(`\n\n👀 Requesting posts from ${name}...\n`, true);

    try {
      const data = isUser 
        ? await apiService.fetchUserPosts(name, limit, lastPostId)
        : await apiService.fetchSubredditPosts(name, state.sorting, state.time, limit, lastPostId);

      if (data.message === 'Not Found' || !data.data || data.data.children.length === 0) {
        throw new Error('Not found or empty');
      }

      state.currentAPICall = data;
      state.responseSize = data.data.children.length;
      state.lastAPICallForSubreddit = data.data.children.length < limit;

      const posts = data.data.children.map((c: any) => c.data);
      if (posts.length > 0) {
        state.downloadedPosts.subreddit = posts[0].subreddit;
      }

      for (const post of posts) {
        // Sleep
        await new Promise(r => setTimeout(r, 250));
        try {
          await processPost(post);
          state.downloadedPosts.media++; 
        } catch (e: any) {
          loggerService.log(`Failed: ${e.message}`, true);
          state.downloadedPosts.failed++;
        }
        
        // Check progress
        const [, downloaded] = state.getPostsRemaining();
        const total = state.numberOfPosts >= ALL_POSTS ? 'all' : state.numberOfPosts;
        loggerService.log(`Still downloading posts from ${chalk.cyan(state.getCurrentSubreddit())}... (${downloaded}/${total})`, false);
      }

      const lastChild = posts[posts.length - 1];
      const newLastPostId = lastChild.name;

      if (!state.lastAPICallForSubreddit && state.getPostsRemaining()[0] > 0) {
        await downloadSubredditBatch(target, newLastPostId);
      } else {
        handleDownloadComplete();
      }

    } catch (err: any) {
      loggerService.log(`ERROR: Problem fetching posts for ${name}: ${err.message}`, true);
      handleDownloadComplete();
    }
  }

  function handleDownloadComplete() {
    const endTime = new Date();
    const startTime = state.startTime || new Date();
    const timeDiff = (endTime.getTime() - startTime.getTime()) / 1000;
    
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
          await processPost(post);
        } catch (e: any) {
          loggerService.log(`Failed to download ${url}: ${e.message}`, true);
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

  try {
    await start();
  } finally {
    dbService.close();
  }
}

main().catch(err => console.error(err));
