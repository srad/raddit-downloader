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

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<void> {
    const { downloadURL, fileType } = getMediaDownloadInfo(post);
    const filename = `${filenameBase}.${fileType}`;
    const filePath = `${targetDir}/${filename}`;

    if (this.fsService.fileExists(filePath)) {
      return; // Skip duplicate
    }

    try {
      const response = await fetch(downloadURL);
      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch media: ${response.statusText}`);
      }

      // Convert Web Stream to Node Stream
      // @ts-ignore - Readable.fromWeb is available in newer Node versions but types might be lagging
      const nodeStream = Readable.fromWeb(response.body);
      const fileStream = this.fsService.createWriteStream(filePath);

      await pipeline(nodeStream, fileStream);
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