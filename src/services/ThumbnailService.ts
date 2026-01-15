import * as path from 'path';
import * as fs from 'fs/promises';
import sharp from 'sharp';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { FileSystemService } from './FileSystemService';
import { LoggerService } from './LoggerService';
import { injectable, inject } from 'tsyringe';
import { DATA_DIR } from '../config/constants';

@injectable()
export class ThumbnailService {
  private thumbnailDir: string;
  private thumbnailSize = 200; // 200x200 thumbnails

  constructor(
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(LoggerService) private loggerService: LoggerService,
  ) {
    this.thumbnailDir = path.join(DATA_DIR, 'thumbnails');
  }

  /**
   * Initialize the thumbnail directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.thumbnailDir, { recursive: true });
    } catch (error) {
      this.loggerService.log(`Failed to create thumbnail directory: ${error}`, true);
    }
  }

  /**
   * Generate a thumbnail for a media file
   * @param filePath Full path to the original file
   * @param relativePath Relative path from downloads directory (e.g., "r_pics/image.jpg")
   * @returns Relative path to the thumbnail or null if failed
   */
  async generateThumbnail(filePath: string, relativePath: string, silent: boolean = false): Promise<string | null> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const thumbnailRelativePath = relativePath.replace(ext, '.webp'); // Use WebP for all thumbnails
      const thumbnailPath = path.join(this.thumbnailDir, thumbnailRelativePath);

      // Create subdirectory if needed
      const thumbnailSubdir = path.dirname(thumbnailPath);
      await fs.mkdir(thumbnailSubdir, { recursive: true });

      // Check if thumbnail already exists
      if (this.fsService.fileExists(thumbnailPath)) {
        return thumbnailRelativePath;
      }

      // Generate based on file type
      if (this.isVideo(ext)) {
        await this.generateVideoThumbnail(filePath, thumbnailPath);
      } else if (this.isImage(ext)) {
        await this.generateImageThumbnail(filePath, thumbnailPath);
      } else {
        return null; // Unsupported file type
      }

      if (!silent) {
        this.loggerService.log(`Generated thumbnail: ${thumbnailRelativePath}`, true);
      }
      return thumbnailRelativePath;
    } catch (error: any) {
      // Log video thumbnail errors more prominently
      const isVideoError = error.message && error.message.includes('ffmpeg');
      const isUnsupportedFormat = error.message && error.message.includes('unsupported');

      if (!silent && isVideoError) {
        this.loggerService.log(`Video thumbnail failed for ${path.basename(relativePath)}: ${error.message}`, true);
      } else if (!silent && !isUnsupportedFormat) {
        this.loggerService.log(`Failed to generate thumbnail for ${relativePath}: ${error}`, true);
      } else if (!silent && isUnsupportedFormat) {
        // Quieter log for unsupported formats
        this.loggerService.log(`Skipped ${path.basename(relativePath)}: ${error.message}`, true);
      }
      return null;
    }
  }

  /**
   * Generate thumbnail for an image file (including GIFs)
   * Maintains aspect ratio and crops to center (not stretched/distorted)
   */
  private async generateImageThumbnail(inputPath: string, outputPath: string): Promise<void> {
    try {
      await sharp(inputPath)
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'cover',           // Crop to fill, maintaining aspect ratio (no distortion)
          position: 'center',     // Crop from center
          withoutEnlargement: false  // Allow upscaling if image is smaller
        })
        .webp({
          quality: 80,
          effort: 4  // Balance between compression time and quality
        })
        .toFile(outputPath);
    } catch (error: any) {
      // Check if it's an unsupported format error
      if (error.message && error.message.includes('unsupported')) {
        // Try to get actual file info
        const metadata = await this.getFileMetadata(inputPath);
        throw new Error(`Unsupported format: file appears to be ${metadata || 'corrupted or invalid'}`);
      }
      throw error;
    }
  }

  /**
   * Try to detect actual file type (not just extension)
   */
  private async getFileMetadata(filePath: string): Promise<string | null> {
    try {
      const metadata = await sharp(filePath).metadata();
      return metadata.format || null;
    } catch {
      return null;
    }
  }

  /**
   * Generate thumbnail for a video file (extract first frame)
   * Uses bundled ffmpeg-static (no system dependencies needed)
   */
  private async generateVideoThumbnail(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!ffmpegPath) {
        reject(new Error('ffmpeg binary not found'));
        return;
      }

      const tempFilename = `temp_${Date.now()}.png`;
      const tempPngPath = path.join(path.dirname(outputPath), tempFilename);

      // ffmpeg command to extract frame at 1 second
      const args = [
        '-ss', '00:00:01',           // Seek to 1 second
        '-i', inputPath,              // Input file
        '-vframes', '1',              // Extract 1 frame
        '-vf', `scale=${this.thumbnailSize}:-1`, // Scale to width, maintain aspect ratio
        '-y',                         // Overwrite output
        tempPngPath                   // Output file
      ];

      const ffmpegProcess = spawn(ffmpegPath, args);
      let stderrOutput = '';

      // Capture stderr for error messages (ffmpeg outputs progress to stderr)
      ffmpegProcess.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      ffmpegProcess.on('close', async (code) => {
        if (code !== 0) {
          // Clean up temp file on error
          await fs.unlink(tempPngPath).catch(() => {});
          reject(new Error(`ffmpeg exited with code ${code}: ${stderrOutput.slice(-200)}`));
          return;
        }

        try {
          // Convert and resize the PNG to WebP with proper cropping
          await sharp(tempPngPath)
            .resize(this.thumbnailSize, this.thumbnailSize, {
              fit: 'cover',
              position: 'center'
            })
            .webp({ quality: 80 })
            .toFile(outputPath);

          // Clean up temp PNG
          await fs.unlink(tempPngPath).catch(() => {});
          resolve();
        } catch (error) {
          // Clean up temp file on error
          await fs.unlink(tempPngPath).catch(() => {});
          reject(error);
        }
      });

      ffmpegProcess.on('error', async (err) => {
        // Clean up temp file on error
        await fs.unlink(tempPngPath).catch(() => {});
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Get the thumbnail path for a given file path
   * @param relativePath Relative path from downloads directory
   * @returns Path to thumbnail (relative) or null if not found
   */
  getThumbnailPath(relativePath: string): string | null {
    const ext = path.extname(relativePath);
    const thumbnailRelativePath = relativePath.replace(ext, '.webp');
    const thumbnailPath = path.join(this.thumbnailDir, thumbnailRelativePath);

    if (this.fsService.fileExists(thumbnailPath)) {
      return thumbnailRelativePath;
    }
    return null;
  }

  /**
   * Batch generate thumbnails for existing files
   * Useful for generating thumbnails for already downloaded files
   */
  async batchGenerateThumbnails(downloadsDir: string): Promise<void> {
    this.loggerService.log('Starting batch thumbnail generation...', false);
    await this.processBatchDirectory(downloadsDir, downloadsDir);
    this.loggerService.log('Batch thumbnail generation complete.', false);
  }

  private async processBatchDirectory(baseDir: string, currentDir: string): Promise<void> {
    try {
      const items = await fs.readdir(currentDir, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(currentDir, item.name);

        if (item.isDirectory()) {
          // Recursively process subdirectories
          await this.processBatchDirectory(baseDir, itemPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (this.isVideo(ext) || this.isImage(ext)) {
            const relativePath = path.relative(baseDir, itemPath).replace(/\\/g, '/');
            await this.generateThumbnail(itemPath, relativePath);
          }
        }
      }
    } catch (error) {
      this.loggerService.log(`Error processing directory ${currentDir}: ${error}`, true);
    }
  }

  private isVideo(ext: string): boolean {
    return ['.mp4', '.webm', '.gifv', '.mov', '.avi', '.mkv'].includes(ext);
  }

  private isImage(ext: string): boolean {
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
  }

  /**
   * Delete thumbnail for a specific file
   * @param relativePath Relative path from downloads directory
   */
  async deleteThumbnail(relativePath: string): Promise<void> {
    try {
      const ext = path.extname(relativePath);
      const thumbnailRelativePath = relativePath.replace(ext, '.webp');
      const thumbnailPath = path.join(this.thumbnailDir, thumbnailRelativePath);

      if (this.fsService.fileExists(thumbnailPath)) {
        await fs.unlink(thumbnailPath);
        this.loggerService.log(`Deleted thumbnail: ${thumbnailRelativePath}`, true);
      }
    } catch (error) {
      this.loggerService.log(`Failed to delete thumbnail for ${relativePath}: ${error}`, true);
    }
  }

  /**
   * Delete all thumbnails in a folder
   * @param relativePath Relative path to folder from downloads directory
   */
  async deleteThumbnailFolder(relativePath: string): Promise<void> {
    try {
      const thumbnailFolderPath = path.join(this.thumbnailDir, relativePath);

      if (this.fsService.fileExists(thumbnailFolderPath)) {
        await fs.rm(thumbnailFolderPath, { recursive: true, force: true });
        this.loggerService.log(`Deleted thumbnail folder: ${relativePath}`, true);
      }
    } catch (error) {
      this.loggerService.log(`Failed to delete thumbnail folder ${relativePath}: ${error}`, true);
    }
  }

  /**
   * Clean up orphaned thumbnails (thumbnails without corresponding original files)
   * @param downloadsDir Path to downloads directory
   */
  async cleanupOrphanedThumbnails(downloadsDir: string): Promise<number> {
    this.loggerService.log('Starting orphaned thumbnail cleanup...', false);
    let deletedCount = 0;

    try {
      deletedCount = await this.processCleanupDirectory(downloadsDir, downloadsDir, this.thumbnailDir);
    } catch (error) {
      this.loggerService.log(`Error during cleanup: ${error}`, true);
    }

    this.loggerService.log(`Cleanup complete. Deleted ${deletedCount} orphaned thumbnails.`, false);
    return deletedCount;
  }

  private async processCleanupDirectory(
    baseDownloadsDir: string,
    currentDownloadsDir: string,
    baseThumbnailDir: string
  ): Promise<number> {
    let deletedCount = 0;

    const relativeDir = path.relative(baseDownloadsDir, currentDownloadsDir);
    const thumbnailDir = path.join(baseThumbnailDir, relativeDir);

    // Check if thumbnail directory exists
    if (!this.fsService.fileExists(thumbnailDir)) {
      return 0;
    }

    try {
      const thumbnailItems = await fs.readdir(thumbnailDir, { withFileTypes: true });

      for (const item of thumbnailItems) {
        const thumbnailItemPath = path.join(thumbnailDir, item.name);

        if (item.isDirectory()) {
          // Recursively process subdirectories
          const downloadsSubdir = path.join(currentDownloadsDir, item.name);
          deletedCount += await this.processCleanupDirectory(baseDownloadsDir, downloadsSubdir, baseThumbnailDir);

          // Check if directory is now empty and delete it
          const remainingItems = await fs.readdir(thumbnailItemPath);
          if (remainingItems.length === 0) {
            await fs.rmdir(thumbnailItemPath);
            this.loggerService.log(`Deleted empty thumbnail directory: ${item.name}`, true);
          }
        } else if (item.isFile() && item.name.endsWith('.webp')) {
          // Check if original file exists
          // Thumbnail "image.webp" corresponds to original "image.jpg/png/etc"
          const baseName = item.name.replace('.webp', '');
          const downloadsItemDir = path.join(currentDownloadsDir);

          // Try to find original file with any extension
          let originalExists = false;
          const possibleExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.mp4', '.webm', '.gifv', '.mov', '.avi', '.mkv'];

          for (const ext of possibleExts) {
            const possibleOriginal = path.join(downloadsItemDir, baseName + ext);
            if (this.fsService.fileExists(possibleOriginal)) {
              originalExists = true;
              break;
            }
          }

          if (!originalExists) {
            await fs.unlink(thumbnailItemPath);
            this.loggerService.log(`Deleted orphaned thumbnail: ${item.name}`, true);
            deletedCount++;
          }
        }
      }
    } catch (error) {
      this.loggerService.log(`Error processing thumbnail directory ${thumbnailDir}: ${error}`, true);
    }

    return deletedCount;
  }
}
