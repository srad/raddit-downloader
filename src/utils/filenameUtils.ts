import { Config, RedditPost } from '../types';

// Max filename length for most filesystems is 255 characters
// Reserve 15 chars for file extensions (.jpg, .mp4, etc.) that are added later
export const MAX_FILENAME_LENGTH = 240;
const EXTENSION_RESERVE = 15;

/**
 * Sanitize a filename to work on Mac, Windows, and Linux
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/([^/])\/([^/])/g, '$1_$2');
}

/**
 * Generate a simple, clean filename: <subreddit>_<readable-timestamp>
 * This avoids issues with special characters, HTML entities, and query parameters
 */
export function getFileName(post: RedditPost, config: Config): string {
  // Convert Unix timestamp to readable format: YYYY-MM-DD_HH-MM-SS
  const date = new Date(post.created * 1000);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');

  const readableTimestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

  // Simple format: subreddit_YYYY-MM-DD_HH-MM-SS
  const fileName = `${post.subreddit}_${readableTimestamp}`;

  return fileName;
}