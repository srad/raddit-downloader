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

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<string> {
    const { downloadURL, fileType } = getMediaDownloadInfo(post);
    const filename = `${filenameBase}.${fileType}`;
    const filePath = `${targetDir}/${filename}`;

    if (this.fsService.fileExists(filePath)) {
      return filename; // Skip duplicate
    }

    try {
      // Log the URL being attempted (helps debug 403s)
      this.loggerService.log(`Downloading: ${downloadURL}`, true);

      // Construct comprehensive headers to bypass 403 blocks
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Connection': 'keep-alive',
        'DNT': '1',
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

      // Convert Web Stream to Node Stream
      // @ts-ignore - Readable.fromWeb is available in newer Node versions
      const nodeStream = Readable.fromWeb(response.body);
      const fileStream = this.fsService.createWriteStream(filePath);

      await pipeline(nodeStream, fileStream);
      return filename;
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
