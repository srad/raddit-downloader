import * as path from 'path';

export const MAX_POSTS_PER_REQUEST = 100;
export const MAX_FILENAME_LENGTH = 240;
export const ALL_POSTS = Number.MAX_SAFE_INTEGER;
export const DEFAULT_REQUEST_TIMEOUT = 30000;
export const MEDIA_FORMATS = ['jpeg', 'jpg', 'gif', 'png', 'mp4', 'webm', 'gifv'];

export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');