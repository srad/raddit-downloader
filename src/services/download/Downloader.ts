import { RedditPost } from '../../types';

export interface Downloader {
  download(post: RedditPost, targetDir: string, filenameBase: string): Promise<void>;
  canHandle(post: RedditPost): boolean;
}
