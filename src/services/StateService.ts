import { Config, DownloadStats, State } from '../types';
import { ALL_POSTS, DATA_DIR } from '../config/constants';
import { singleton, inject } from 'tsyringe';
import { CONFIG_TOKEN } from '../config/tokens';
import * as path from 'path';

@singleton()
export class StateService implements State {
  subredditList: string[] = [];
  numberOfPosts: number = -1;
  sorting: string = 'top';
  time: string = 'all';
  repeatForever: boolean = false;
  timeBetweenRuns: number = 0;
  downloadDirectoryBase: string = path.join(DATA_DIR, 'downloads');
  currentSubredditIndex: number = 0;
  responseSize: number = -1;
  startTime: Date | null = null;
  lastAPICallForSubreddit: boolean = false;
  currentAPICall: any = null;
  downloadDirectory: string = '';
  downloadedPosts: DownloadStats;

  constructor(@inject(CONFIG_TOKEN) private config: Config) {
    this.downloadedPosts = this.createEmptyDownloadStats();
  }

  public createEmptyDownloadStats(): DownloadStats {
    return {
      subreddit: '',
      self: 0,
      media: 0,
      link: 0,
      failed: 0,
      skipped_due_to_duplicate: 0,
      skipped_due_to_fileType: 0,
    };
  }

  public initFromTestingMode(): void {
    const opts = this.config.testingModeOptions || {};
    this.subredditList = opts.subredditList || [];
    this.numberOfPosts = opts.numberOfPosts || -1;
    this.sorting = opts.sorting || 'top';
    this.time = opts.time || 'all';
    this.repeatForever = opts.repeatForever || false;
    this.timeBetweenRuns = opts.timeBetweenRuns || 0;
    if (opts.downloadDirectory) {
      this.downloadDirectoryBase = opts.downloadDirectory;
    }
  }

  public initFromPostListOptions(postCount: number): void {
    this.numberOfPosts = postCount;
    this.repeatForever = this.config.download_post_list_options.repeatForever;
    this.timeBetweenRuns = this.config.download_post_list_options.timeBetweenRuns;
  }

  public initFromPrompts(result: any): boolean {
    if (!result || !result.subreddit) {
      return false;
    }

    this.subredditList = result.subreddit.split(',').map((s: string) => s.replace(/\s/g, ''));
    this.repeatForever = result.repeatForever;
    this.numberOfPosts = result.numberOfPosts === 0 ? ALL_POSTS : result.numberOfPosts;
    this.sorting = result.sorting.replace(/\s/g, '');
    this.time = result.time.replace(/\s/g, '');

    if (result.downloadDirectory) {
      this.downloadDirectoryBase = result.downloadDirectory;
    }

    if (this.repeatForever && result.timeBetweenRuns >= 0) {
      this.timeBetweenRuns = result.timeBetweenRuns;
    }

    this.startTime = new Date();
    return true;
  }

  public getPostsRemaining(): [number, number] {
    const total =
      this.downloadedPosts.self +
      this.downloadedPosts.media +
      this.downloadedPosts.link +
      this.downloadedPosts.failed +
      this.downloadedPosts.skipped_due_to_duplicate +
      this.downloadedPosts.skipped_due_to_fileType;
    return [this.numberOfPosts - total, total];
  }

  public resetDownloadStats(): void {
    this.downloadedPosts = this.createEmptyDownloadStats();
    this.downloadDirectory = '';
  }

  public getCurrentSubreddit(): string {
    return this.subredditList[this.currentSubredditIndex];
  }

  public nextSubreddit(): boolean {
    if (this.currentSubredditIndex < this.subredditList.length - 1) {
      this.currentSubredditIndex += 1;
      return true;
    }
    return false;
  }

  public resetSubredditIndex(): void {
    this.currentSubredditIndex = 0;
  }
}
