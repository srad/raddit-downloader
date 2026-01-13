export interface RedditPost {
  created: number;
  score: number;
  subreddit: string;
  author: string;
  title: string;
  post_hint?: string;
  is_self?: boolean;
  domain: string;
  url_overridden_by_dest?: string;
  poll_data?: unknown;
  is_gallery?: boolean;
  url: string;
  selftext?: string;
  preview?: {
    reddit_video_preview?: {
      fallback_url: string;
    };
    images?: Array<{
      source?: {
        url: string;
      };
    }>;
  };
  media?: {
    reddit_video?: {
      fallback_url: string;
    };
    oembed?: {
      thumbnail_url?: string;
    };
  };
  media_metadata?: Record<string, any>;
  gallery_data?: {
    items: Array<{
      media_id: string;
      id: number;
    }>;
  };
  name: string; // fullname id (e.g. t3_12345)
  over_18?: boolean;
  [key: string]: any;
}

export interface Config {
  file_naming_scheme: {
    showDate?: boolean;
    showScore?: boolean;
    showSubreddit?: boolean;
    showAuthor?: boolean;
    showTitle?: boolean;
  };
  download_post_list_options: {
    enabled: boolean;
    repeatForever: boolean;
    timeBetweenRuns: number;
  };
  testingMode?: boolean;
  testingModeOptions?: any;
  detailed_logs?: boolean;
  local_logs?: boolean;
  local_logs_naming_scheme: {
    showDateAndTime: boolean;
    showSubreddits: boolean;
    showNumberOfPosts: boolean;
  };
  separate_clean_nsfw?: boolean;
  redownload_posts?: boolean;
  download_gallery_posts?: boolean;
  download_self_posts?: boolean;
  download_media_posts?: boolean;
  download_link_posts?: boolean;
  download_comments?: boolean;
  download_youtube_videos_experimental?: boolean;
  use_history_database?: boolean;
  [key: string]: any;
}

export interface DownloadStats {
  subreddit: string;
  self: number;
  media: number;
  link: number;
  failed: number;
  skipped_due_to_duplicate: number;
  skipped_due_to_fileType: number;
  [key: string]: any;
}

export interface State {
  subredditList: string[];
  numberOfPosts: number;
  sorting: string;
  time: string;
  repeatForever: boolean;
  timeBetweenRuns: number;
  downloadDirectoryBase: string;
  currentSubredditIndex: number;
  responseSize: number;
  startTime: Date | null;
  lastAPICallForSubreddit: boolean;
  currentAPICall: any;
  downloadDirectory: string;
  downloadedPosts: DownloadStats;
  
  initFromTestingMode(): void;
  initFromPostListOptions(postCount: number): void;
  initFromPrompts(result: any): boolean;
  getPostsRemaining(): [number, number];
  resetDownloadStats(): void;
  getCurrentSubreddit(): string;
  nextSubreddit(): boolean;
  resetSubredditIndex(): void;
  createEmptyDownloadStats(): DownloadStats;
}