const fs = require('fs');
const path = require('path');

const content = `import { Runner } from './Runner';
import express from 'express';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import open from 'open';
import { injectable, container } from 'tsyringe';
import { ConfigService } from '../services/ConfigService';
import { StateService } from '../services/StateService';
import { RedditApiService } from '../services/RedditApiService';
import { FileSystemService } from '../services/FileSystemService';
import { DatabaseService } from '../services/DatabaseService';
import { DownloadManager } from '../services/download/DownloadManager';
import { DownloadOrchestrator } from '../services/DownloadOrchestrator';
import { MediaDownloader } from '../services/download/MediaDownloader';
import { GalleryDownloader } from '../services/download/GalleryDownloader';
import { YouTubeDownloader } from '../services/download/YouTubeDownloader';
import { RedgifsDownloader } from '../services/download/RedgifsDownloader';
import { ThumbnailService } from '../services/ThumbnailService';
import { PhashService } from '../services/PhashService';
import { CONFIG_TOKEN, DB_PATH_TOKEN } from '../config/tokens';
import { ALL_POSTS, DATA_DIR } from '../config/constants';
import { Config, FileItem } from '../types';
import { FileUtils } from "../utils/fileUtils"

@injectable()
export class WebRunner extends EventEmitter implements Runner {
  private app: express.Application;
  private server: Server;
  private io: SocketIOServer;
  private port = 3000;
  private isRunning = false;
  private dbService!: DatabaseService;
  private configService!: ConfigService;
  private abortController: AbortController | null = null;
  private duplicateScanController: AbortController | null = null;

  constructor() {
    super();
    this.app = express();
    this.server = new Server(this.app);
    this.io = new SocketIOServer(this.server);

    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.json());
  }

  public getPort(): number {
    return this.port;
  }

  public getStatus(): boolean {
    return this.isRunning;
  }

  private async indexMissingThumbnails(thumbnailService: ThumbnailService, downloadsDir: string): Promise<void> {
    console.log('Indexing files for missing thumbnails...');
    const filesToProcess = await this.countFilesNeedingThumbnails(thumbnailService, downloadsDir, downloadsDir);
    if (filesToProcess === 0) {
      console.log('✓ All files already have thumbnails');
      return;
    }
    this.io.emit('thumbnail_generation', { status: 'started', total: filesToProcess, processed: 0 });
    try {
      const result = await this.processDirectoryForThumbnails(thumbnailService, downloadsDir, downloadsDir, filesToProcess, (processed) => {
        this.io.emit('thumbnail_generation', { status: 'processing', total: filesToProcess, processed: processed });
      });
      console.log(\`✓ Generated \${result.generated} thumbnail(s)\`);
      this.io.emit('thumbnail_generation', { status: 'completed', total: filesToProcess, processed: result.generated, skipped: result.skipped });
    } catch (error) {
      console.error('Error during thumbnail indexing:', error);
      this.io.emit('thumbnail_generation', { status: 'error', error: String(error) });
    }
  }

  private async indexMissingPhashes(phashService: PhashService, fsService: FileSystemService, downloadsDir: string): Promise<void> {
    console.log('Checking for files missing perceptual hashes...');
    const records = await this.dbService.getDownloads({ hasPhash: false });
    if (records.length === 0) {
      console.log('✓ All files have perceptual hashes');
      return;
    }
    console.log(\`Found \${records.length} files without phash. Generating in background...\`);
    this.io.emit('phash_generation', { status: 'started', total: records.length, processed: 0 });
    let processed = 0;
    let generated = 0;
    let failed = 0;
    try {
      for (const record of records) {
        const fullPath = path.join(downloadsDir, record.path);
        processed++;
        if (!fs.existsSync(fullPath)) continue;
        try {
          const phash = await phashService.generatePhash(fullPath);
          if (phash) {
            const phashStr = Array.isArray(phash) ? JSON.stringify(phash) : phash;
            await this.dbService.updatePhash(record.id, phashStr);
            generated++;
          } else failed++;
        } catch (error) { failed++; }
        if (processed % 10 === 0 || processed === records.length) {
          this.io.emit('phash_generation', { status: 'processing', total: records.length, processed, generated, failed });
        }
      }
      this.io.emit('phash_generation', { status: 'completed', total: records.length, processed, generated, failed });
    } catch (error) {
      console.error('Error during phash indexing:', error);
    }
  }

  private async countFilesNeedingThumbnails(thumbnailService: ThumbnailService, baseDir: string, currentDir: string): Promise<number> {
    let count = 0;
    try {
      const items = await fs.readdir(currentDir, { withFileTypes: true });
      for (const item of items) {
        const itemPath = path.join(currentDir, item.name);
        if (item.isDirectory()) {
          count += await this.countFilesNeedingThumbnails(thumbnailService, baseDir, itemPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          const isMedia = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.mp4', '.webm', '.gifv', '.mov', '.avi', '.mkv'].includes(ext);
          if (isMedia) {
            const relativePath = path.relative(baseDir, itemPath).replace(/\\/g, '/');
            const thumbnailPath = thumbnailService.getThumbnailPath(relativePath);
            if (!thumbnailPath) count++;
          }
        }
      }
    } catch (error) { console.error(error); }
    return count;
  }

  private async processDirectoryForThumbnails(thumbnailService: ThumbnailService, baseDir: string, currentDir: string, totalFiles: number, onProgress: (processed: number) => void): Promise<{ generated: number; skipped: number }> {
    let generated = 0; let skipped = 0;
    try {
      const items = await fs.readdir(currentDir, { withFileTypes: true });
      for (const item of items) {
        const itemPath = path.join(currentDir, item.name);
        if (item.isDirectory()) {
          const res = await this.processDirectoryForThumbnails(thumbnailService, baseDir, itemPath, totalFiles, onProgress);
          generated += res.generated; skipped += res.skipped;
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          const isMedia = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.mp4', '.webm', '.gifv', '.mov', '.avi', '.mkv'].includes(ext);
          if (isMedia) {
            const relativePath = path.relative(baseDir, itemPath).replace(/\\/g, '/');
            if (!thumbnailService.getThumbnailPath(relativePath)) {
              const res = await thumbnailService.generateThumbnail(itemPath, relativePath, true);
              if (res) { generated++; onProgress(generated); } else skipped++;
            }
          }
        }
      }
    } catch (error) { console.error(error); }
    return { generated, skipped };
  }

  async run(options: { openBrowser?: boolean; port?: number } = {}): Promise<void> {
    const { openBrowser = true, port = 3000 } = options;
    this.port = port;
    const config = ConfigService.load();
    if (!container.isRegistered(CONFIG_TOKEN)) container.register(CONFIG_TOKEN, { useValue: config });
    if (!container.isRegistered(DB_PATH_TOKEN)) container.register(DB_PATH_TOKEN, { useValue: path.join(DATA_DIR, 'data.db') });
    this.dbService = container.resolve(DatabaseService);
    this.configService = container.resolve(ConfigService);
    const thumbnailService = container.resolve(ThumbnailService);
    await thumbnailService.initialize();
  
