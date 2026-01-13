import { Config, RedditPost } from '../types';

export const MAX_FILENAME_LENGTH = 240;

/**
 * Sanitize a filename to work on Mac, Windows, and Linux
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/([^/])\/([^/])/g, '$1_$2');
}

/**
 * Generate a filename for a post based on config settings
 */
export function getFileName(post: RedditPost, config: Config): string {
  let fileName = '';

  const namingScheme = config.file_naming_scheme;

  if (namingScheme.showDate || namingScheme.showDate === undefined) {
    const timestamp = post.created;
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    fileName += `${year}-${month}-${day}`;
  }

  if (namingScheme.showScore || namingScheme.showScore === undefined) {
    fileName += `_score=${post.score}`;
  }

  if (namingScheme.showSubreddit || namingScheme.showSubreddit === undefined) {
    fileName += `_${post.subreddit}`;
  }

  if (namingScheme.showAuthor || namingScheme.showAuthor === undefined) {
    fileName += `_${post.author}`;
  }

  if (namingScheme.showTitle || namingScheme.showTitle === undefined) {
    const title = sanitizeFileName(post.title);
    fileName += `_${title}`;
  }

  // Clean up
  fileName = fileName.replace(/(?:\r\n|\r|\n|\t)/g, '');
  fileName = fileName.replace(/\ufe0e/g, '');
  fileName = fileName.replace(/\ufe0f/g, '');

  if (fileName.length > MAX_FILENAME_LENGTH) {
    fileName = fileName.substring(0, MAX_FILENAME_LENGTH);
  }

  return fileName;
}
