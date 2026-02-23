import { Downloader } from './Downloader';
import { RedditPost } from '../../types';
import { FileSystemService } from '../FileSystemService';
import { getMediaDownloadInfo, PostType, getPostType } from '../../utils/postUtils';
import { LoggerService } from '../LoggerService';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { injectable, inject } from 'tsyringe';

@injectable()
export class MediaDownloader implements Downloader {
  constructor(
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(LoggerService) private loggerService: LoggerService,
  ) {}

  canHandle(post: RedditPost): boolean {
    return getPostType(post) === PostType.Media;
  }

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<string[]> {
    const { downloadURL, fileType } = getMediaDownloadInfo(post);
    const filename = `${filenameBase}.${fileType}`;
    const filePath = `${targetDir}/${filename}`;

    if (this.fsService.fileExists(filePath)) {
      return [filename]; // Skip duplicate
    }

    try {
      // Log the URL being attempted (helps debug 403s)
      this.loggerService.log(`Downloading: ${downloadURL}`, true);

      // Construct comprehensive headers to bypass 403 blocks
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Connection: 'keep-alive',
        DNT: '1',
        'Upgrade-Insecure-Requests': '1',
      };

      // Add Referer and Origin based on the source domain
      if (downloadURL.includes('i.redd.it') || downloadURL.includes('preview.redd.it')) {
        headers['Referer'] = 'https://www.reddit.com/';
        headers['Origin'] = 'https://www.reddit.com';
      } else if (downloadURL.includes('imgur.com') || downloadURL.includes('i.imgur.com')) {
        headers['Referer'] = 'https://imgur.com/';
      } else if (downloadURL.includes('redgifs.com')) {
        headers['Referer'] = 'https://www.redgifs.com/';
      } else if (downloadURL.includes('gfycat.com')) {
        headers['Referer'] = 'https://gfycat.com/';
      } else {
        // Generic referer for other hosts
        headers['Referer'] = 'https://www.reddit.com/';
      }

      const response = await fetch(downloadURL, { headers });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch media: ${response.statusText} (${response.status})`);
      }

      // Validate Content-Type to prevent HTML/text files from being saved as images
      const contentType = response.headers.get('content-type')?.toLowerCase() || '';

      // Check if response is HTML or other text type (error pages, redirects, etc.)
      if (
        contentType.includes('text/html') ||
        contentType.includes('application/json') ||
        contentType.includes('text/plain')
      ) {
        this.loggerService.log(`ERROR: Received ${contentType} instead of media file for: ${downloadURL}`, true);
        throw new Error(`Invalid content type: ${contentType} (expected image/video)`);
      }

      // Verify content type matches expected file type
      const expectedTypes: Record<string, string[]> = {
        jpg: ['image/jpeg', 'image/jpg'],
        jpeg: ['image/jpeg', 'image/jpg'],
        png: ['image/png'],
        gif: ['image/gif'],
        webp: ['image/webp'],
        mp4: ['video/mp4'],
        webm: ['video/webm'],
      };

      const expectedContentTypes = expectedTypes[fileType] || [];
      const hasValidType = expectedContentTypes.some((type) => contentType.includes(type));

      // Only warn if we have an expected type but got something different
      // (Allow downloads when Content-Type is missing or unknown)
      if (
        expectedContentTypes.length > 0 &&
        contentType &&
        !hasValidType &&
        !contentType.includes('application/octet-stream')
      ) {
        this.loggerService.log(`WARNING: Content-Type mismatch for ${downloadURL}`, true);
        this.loggerService.log(`  Expected: ${expectedContentTypes.join(' or ')}`, true);
        this.loggerService.log(`  Received: ${contentType}`, true);
        this.loggerService.log(`  Continuing download anyway...`, true);
      }

      // Convert Web Stream to Node Stream
      // @ts-ignore - Readable.fromWeb is available in newer Node versions
      const nodeStream = Readable.fromWeb(response.body);
      const fileStream = this.fsService.createWriteStream(filePath);

      await pipeline(nodeStream, fileStream);
      return [filename];
    } catch (error: any) {
      if (error.code === 'ENOTFOUND') {
        this.loggerService.log(`ERROR: Hostname not found for: ${downloadURL}`, true);
      } else {
        this.loggerService.log(`ERROR: ${error}`, true);
        // Clean up partial file
        await this.fsService.deleteFile(filePath);
      }
      throw error;
    }
  }
}
