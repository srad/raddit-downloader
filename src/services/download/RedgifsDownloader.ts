import { Downloader } from './Downloader';
import { RedditPost } from '../../types';
import { FileSystemService } from '../FileSystemService';
import { LoggerService } from '../LoggerService';
import { getExtensionFromUrl } from '../../utils/postUtils';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { injectable, inject } from 'tsyringe';

@injectable()
export class RedgifsDownloader implements Downloader {
  private redgifsToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(LoggerService) private loggerService: LoggerService,
  ) {}

  canHandle(post: RedditPost): boolean {
    return post.url.includes('redgifs.com/watch') || post.url.includes('gfycat.com/');
  }

  /**
   * Get a temporary access token from RedGifs API
   */
  private async getRedgifsToken(): Promise<string | null> {
    // Check if we have a valid cached token
    if (this.redgifsToken && Date.now() < this.tokenExpiry) {
      return this.redgifsToken;
    }

    try {
      const response = await fetch('https://api.redgifs.com/v2/auth/temporary', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        this.loggerService.log(`RedGifs auth failed: ${response.status}`, true);
        return null;
      }

      const data = await response.json();
      this.redgifsToken = data.token;
      // Cache token for 1 hour (tokens typically last 24 hours but we'll refresh more often)
      this.tokenExpiry = Date.now() + 3600000;

      this.loggerService.log('RedGifs token obtained successfully', true);
      return this.redgifsToken;
    } catch (error) {
      this.loggerService.log(`RedGifs auth error: ${error}`, true);
      return null;
    }
  }

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<string> {
    let videoUrl: string | null = null;

    try {
      if (post.url.includes('redgifs.com/watch')) {
        videoUrl = await this.getRedgifsVideoUrl(post.url);
      } else if (post.url.includes('gfycat.com/')) {
        videoUrl = await this.getGfycatVideoUrl(post.url);
      }

      if (!videoUrl) {
        throw new Error('Could not extract video URL');
      }

      // Extract extension from video URL (e.g., .mp4, .webm)
      const extension = getExtensionFromUrl(videoUrl);
      if (!extension) {
        throw new Error(`Could not determine file type from URL: ${videoUrl}`);
      }

      const filename = `${filenameBase}.${extension}`;
      const filePath = `${targetDir}/${filename}`;

      if (this.fsService.fileExists(filePath)) {
        return filename; // Skip duplicate
      }

      this.loggerService.log(`Downloading RedGifs/Gfycat: ${videoUrl}`, true);

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': post.url,
      };

      const response = await fetch(videoUrl, { headers });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch video: ${response.statusText} (${response.status})`);
      }

      // @ts-ignore
      const nodeStream = Readable.fromWeb(response.body);
      const fileStream = this.fsService.createWriteStream(filePath);

      await pipeline(nodeStream, fileStream);
      return filename;
    } catch (error: any) {
      this.loggerService.log(`ERROR: Failed to download RedGifs/Gfycat: ${error.message}`, true);
      throw error;
    }
  }

  private async getRedgifsVideoUrl(pageUrl: string): Promise<string | null> {
    try {
      // Extract video ID from URL: https://www.redgifs.com/watch/videoId
      const match = pageUrl.match(/watch\/([a-zA-Z0-9]+)/);
      if (!match) return null;

      const videoId = match[1];

      // Get authentication token
      const token = await this.getRedgifsToken();
      if (!token) {
        this.loggerService.log('Failed to get RedGifs auth token', true);
        return null;
      }

      // Use RedGifs API v2 with authentication
      const apiUrl = `https://api.redgifs.com/v2/gifs/${videoId}`;

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        this.loggerService.log(`RedGifs API error: ${response.status}`, true);
        // If token expired, clear it and retry once
        if (response.status === 401) {
          this.redgifsToken = null;
          this.tokenExpiry = 0;
        }
        return null;
      }

      const data = await response.json();

      // Try HD first, fall back to SD
      return data.gif?.urls?.hd || data.gif?.urls?.sd || null;
    } catch (error) {
      this.loggerService.log(`RedGifs extraction failed: ${error}`, true);
      return null;
    }
  }

  private async getGfycatVideoUrl(pageUrl: string): Promise<string | null> {
    try {
      // Extract video ID from URL: https://gfycat.com/videoId
      const match = pageUrl.match(/gfycat\.com\/([a-zA-Z0-9]+)/);
      if (!match) return null;

      const videoId = match[1];

      // Use Gfycat API
      const apiUrl = `https://api.gfycat.com/v1/gfycats/${videoId}`;

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        this.loggerService.log(`Gfycat API error: ${response.status}`, true);
        return null;
      }

      const data = await response.json();

      // Try mobile URL first (usually works), fall back to mp4Url
      return data.gfyItem?.mobileUrl || data.gfyItem?.mp4Url || null;
    } catch (error) {
      this.loggerService.log(`Gfycat extraction failed: ${error}`, true);
      return null;
    }
  }
}
