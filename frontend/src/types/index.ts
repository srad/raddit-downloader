export interface FileItem {
  id: number;
  filename: string;
  size: number;
  source?: string;
  thumbnail: string | null;
  path: string;
  url?: string;
  isDirectory?: boolean;
  fileCount?: number;
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
  rate_limit_delay_ms?: number;
  prevent_duplicates?: boolean;
  duplicate_threshold?: number;
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

declare global {
  interface Window {
    version: string;
    electronAPI?: {
      openFolder: (path: string) => Promise<{ success: boolean; error?: string }>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onWindowStateChange: (callback: (isMaximized: boolean) => void) => void;
      version?: string;
    };
    backend?: {
      port: string | number;
    };
  }
}