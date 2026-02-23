/**
 * Reddit API response structure
 */
export interface RedditApiResponse {
  kind: string;
  data: {
    after: string | null;
    before: string | null;
    children: Array<{
      kind: string;
      data: RedditPost;
    }>;
    dist: number;
  };
  message?: string; // Error message if request fails
}

/**
 * Prompt answers from CLI prompts
 */
export interface PromptAnswers {
  subreddit: string;
  numberOfPosts: number;
  sorting: string;
  time: string;
  repeatForever: boolean;
  timeBetweenRuns?: number;
  downloadDirectory?: string;
}

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
  media_metadata?: Record<string, MediaMetadataItem>;
  gallery_data?: {
    items: Array<{
      media_id: string;
      id: number;
      outbound_url?: string;
      caption?: string;
    }>;
  };
  name: string; // fullname id (e.g. t3_12345)
  over_18?: boolean;
}

/**
 * Reddit's media metadata structure (abbreviated property names from Reddit API)
 */
export interface MediaMetadataItem {
  status?: string; // Status of the media item
  e?: string; // Encoding/type (e.g., "Image", "AnimatedImage")
  m?: string; // MIME type (e.g., "image/jpg", "image/png")
  p?: Array<{
    // Preview images at different sizes
    x: number; // Width
    y: number; // Height
    u?: string; // URL
  }>;
  s?: {
    // Source (full-size image info)
    x?: number; // Width
    y?: number; // Height
    u?: string; // URL
    gif?: string; // GIF URL if animated
    mp4?: string; // MP4 URL if animated
  };
  id?: string; // Media ID
}

export interface Config {
  testingMode?: boolean;
  testingModeOptions?: TestingModeOptions;
  detailed_logs?: boolean;
  local_logs?: boolean;
  local_logs_naming_scheme: {
    showDateAndTime: boolean;
    showSubreddits: boolean;
    showNumberOfPosts: boolean;
  };
  redownload_posts?: boolean;
  download_comments?: boolean;
  download_youtube_videos_experimental?: boolean;
  use_history_database?: boolean;
  rate_limit_delay_ms?: number; // Custom delay between API requests (default: 2000ms)
  prevent_duplicates?: boolean; // Active duplicate prevention during download
  duplicate_threshold?: number; // Hamming distance threshold for duplicate detection (default: 5)
}

export interface TestingModeOptions {
  subredditList?: string[];
  numberOfPosts?: number;
  sorting?: string;
  time?: string;
  repeatForever?: boolean;
  timeBetweenRuns?: number;
  downloadDirectory?: string;
}

export interface DownloadStats {
  subreddit: string;
  self: number;
  media: number;
  link: number;
  failed: number;
  skipped_due_to_duplicate: number;
  skipped_due_to_fileType: number;
}

export interface FileItem {
  id: number;
  filename: string;
  isDirectory: boolean;
  path: string;
  size: number;
  fileCount?: number;
  thumbnail: string | null;
}

export interface DownloadResult {
  downloaded: boolean;
  fileItem?: FileItem;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
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
  currentAPICall: RedditApiResponse | null;
  downloadDirectory: string;
  downloadedPosts: DownloadStats;

  initFromTestingMode(): void;
  initFromPrompts(result: PromptAnswers): boolean;
  getPostsRemaining(): [number, number];
  resetDownloadStats(): void;
  getCurrentSubreddit(): string;
  nextSubreddit(): boolean;
  resetSubredditIndex(): void;
  createEmptyDownloadStats(): DownloadStats;
}
