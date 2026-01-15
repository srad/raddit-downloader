import { Downloader } from './Downloader';
import { RedditPost, Config } from '../../types';
import { LoggerService } from '../LoggerService';
import { DatabaseService } from '../DatabaseService';
import { FileSystemService } from '../FileSystemService';
import { ThumbnailService } from '../ThumbnailService';
import { singleton, inject } from 'tsyringe';
import { CONFIG_TOKEN } from '../../config/tokens';
import * as path from 'path';
import { DEBUG } from '../../config/constants';

@singleton()
export class DownloadManager {
  private downloaders: Downloader[] = [];

  constructor(
    @inject(LoggerService) private loggerService: LoggerService,
    @inject(CONFIG_TOKEN) private config: Config,
    @inject(DatabaseService) private dbService: DatabaseService,
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(ThumbnailService) private thumbnailService: ThumbnailService
  ) {}

  public registerDownloader(downloader: Downloader): void {
    this.downloaders.push(downloader);
  }

  public async download(post: RedditPost, targetDir: string, filenameBase: string, source?: string): Promise<void> {
    // Check History DB - but only skip if file actually exists on disk
    if (
      this.dbService &&
      this.config.use_history_database !== false &&
      !this.config.redownload_posts
    ) {
      const dbRecord = await this.dbService.getDownloadRecord(post.name);
      if (dbRecord) {
        // dbRecord.path contains full relative path (e.g., "r_pics/somefile.jpg")
        const baseDir = path.dirname(targetDir); // Get parent directory (e.g., "/data/downloads")
        const fullPath = path.join(baseDir, dbRecord.path);

        if (this.fsService.fileExists(fullPath)) {
          this.loggerService.log(`Skipping duplicate (file exists): ${post.title}`, true);
          return;
        } else {
          this.loggerService.log(`Re-downloading (file missing from disk): ${post.title}`, true);
          // File is missing, so we'll download it again
        }
      }
    }

    if (DEBUG) {
        // Log post details for debugging
        this.loggerService.log(`Processing post: ${post.title}`, true);
        this.loggerService.log(`  URL: ${post.url}`, true);
        this.loggerService.log(`  Domain: ${post.domain}`, true);
        this.loggerService.log(`  Post hint: ${post.post_hint || 'none'}`, true);
    }

    for (const downloader of this.downloaders) {
      const downloaderName = downloader.constructor.name;
      const canHandle = downloader.canHandle(post);
      //this.loggerService.log(`  ${downloaderName}: ${canHandle ? 'YES' : 'no'}`, true);

      if (canHandle) {
        this.loggerService.log(`Using ${downloaderName} for: ${post.title}`, true);
        const filename = await downloader.download(post, targetDir, filenameBase);

        if (this.dbService && this.config.use_history_database !== false) {
           // Use provided source or fall back to post.subreddit
           const downloadSource = source || post.subreddit;
           // Store full relative path: "r_pics/somefile.jpg"
           const relativeDir = path.basename(targetDir);
           const relativePath = `${relativeDir}/${filename}`;
           await this.dbService.addDownload(post, filename, relativePath, downloadSource);
        }

        // Generate thumbnail for the downloaded file
        const relativeDir = path.basename(targetDir);
        const relativePath = `${relativeDir}/${filename}`;
        const filePath = path.join(targetDir, filename);
        await this.thumbnailService.generateThumbnail(filePath, relativePath);

        return;
      }
    }
    this.loggerService.log(`❌ No downloader found for post: ${post.title}`, true);
  }
}
