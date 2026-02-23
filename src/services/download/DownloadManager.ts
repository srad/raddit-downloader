import { Downloader } from './Downloader';
import { RedditPost, Config, DownloadResult, FileItem } from '../../types';
import { LoggerService } from '../LoggerService';
import { DatabaseService } from '../DatabaseService';
import { FileSystemService } from '../FileSystemService';
import { ThumbnailService } from '../ThumbnailService';
import { PhashService } from '../PhashService';
import { singleton, inject } from 'tsyringe';
import { CONFIG_TOKEN } from '../../config/tokens';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DEBUG } from '../../config/constants';

@singleton()
export class DownloadManager {
  private downloaders: Downloader[] = [];

  constructor(
    @inject(LoggerService) private loggerService: LoggerService,
    @inject(CONFIG_TOKEN) private config: Config,
    @inject(DatabaseService) private dbService: DatabaseService,
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(ThumbnailService) private thumbnailService: ThumbnailService,
    @inject(PhashService) private phashService: PhashService,
  ) {}

  public registerDownloader(downloader: Downloader): void {
    this.downloaders.push(downloader);
  }

  public async download(
    post: RedditPost,
    targetDir: string,
    filenameBase: string,
    source?: string,
  ): Promise<DownloadResult> {
    // Check History DB - but only skip if file actually exists on disk
    if (this.dbService && this.config.use_history_database !== false && !this.config.redownload_posts) {
      const dbRecord = await this.dbService.getDownloadRecord(post.name);
      if (dbRecord) {
        // dbRecord.path contains full relative path (e.g., "r_pics/somefile.jpg")
        const baseDir = path.dirname(targetDir); // Get parent directory (e.g., "/data/downloads")
        const fullPath = path.join(baseDir, dbRecord.path);

        if (this.fsService.fileExists(fullPath)) {
          this.loggerService.log(`Skipping duplicate (file exists): ${post.title}`, true);
          return { downloaded: false };
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
        const filenames = await downloader.download(post, targetDir, filenameBase);
        const fileItems: FileItem[] = [];

        for (let i = 0; i < filenames.length; i++) {
          const filename = filenames[i];
          const fullFilePath = path.join(targetDir, filename);

          // Generate perceptual hash for duplicate detection
          let phashStr: string | null = null;
          try {
            const phash = await this.phashService.generatePhash(fullFilePath);
            if (phash) {
              // Serialize phash (single string for images, JSON array for videos)
              phashStr = Array.isArray(phash) ? JSON.stringify(phash) : phash;
              this.loggerService.log(
                `  Generated phash for item ${i + 1}: ${Array.isArray(phash) ? `[${phash.length} frames]` : phashStr.substring(0, 12)}...`,
                true,
              );

              // Active duplicate prevention
              if (this.config.prevent_duplicates !== false) {
                const threshold = this.config.duplicate_threshold ?? 5;
                const duplicate = await this.phashService.findDuplicate(phash, threshold);

                if (duplicate) {
                  this.loggerService.log(
                    `  Duplicate detected (content match) for item ${i + 1}: same as ${duplicate.filename} from ${duplicate.source}`,
                    true,
                  );
                  this.loggerService.log(`  Skipping and deleting duplicate...`, true);

                  await this.fsService.deleteFile(fullFilePath);
                  continue;
                }
              }
            }
          } catch (error: any) {
            this.loggerService.log(`  Warning: phash generation failed for item ${i + 1}: ${error.message}`, true);
          }

          let insertedId = 0;
          if (this.dbService && this.config.use_history_database !== false) {
            const downloadSource = source || post.subreddit;
            const relativeDir = path.basename(targetDir);
            const relativePath = `${relativeDir}/${filename}`;

            // Create unique post ID for gallery items to satisfy UNIQUE constraint
            const uniquePostId = filenames.length > 1 ? `${post.name}_${String(i + 1).padStart(2, '0')}` : post.name;

            const miniPost = { ...post, name: uniquePostId };
            insertedId = await this.dbService.addDownload(miniPost, filename, relativePath, downloadSource, phashStr);
          }

          // Generate thumbnail
          const relativeDir = path.basename(targetDir);
          const relativePath = `${relativeDir}/${filename}`;
          const thumbnailRelativePath = await this.thumbnailService.generateThumbnail(fullFilePath, relativePath);

          const stats = await fs.stat(fullFilePath);

          fileItems.push({
            id: insertedId,
            filename: filename,
            isDirectory: false,
            path: relativePath,
            size: stats.size,
            thumbnail: thumbnailRelativePath,
          });
        }

        if (fileItems.length === 0) {
          return { downloaded: false };
        }

        return { downloaded: true, fileItem: fileItems[0] }; // Return first item for backward compatibility if needed
      }
    }
    this.loggerService.log(`❌ No downloader found for post: ${post.title}`, true);
    return { downloaded: false };
  }
}
