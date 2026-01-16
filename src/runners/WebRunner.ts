import { Runner } from './Runner';
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
//import { TextDownloader } from '../services/download/TextDownloader';
//import { LinkDownloader } from '../services/download/LinkDownloader';
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

  /**
   * Index and generate missing thumbnails in the background
   * This runs on startup to ensure all files have thumbnails
   */
  private async indexMissingThumbnails(thumbnailService: ThumbnailService, downloadsDir: string): Promise<void> {
    console.log('Indexing files for missing thumbnails...');

    // First, count total files that need thumbnails
    const filesToProcess = await this.countFilesNeedingThumbnails(thumbnailService, downloadsDir, downloadsDir);

    if (filesToProcess === 0) {
      console.log('✓ All files already have thumbnails');
      return;
    }

    // Emit start event
    this.io.emit('thumbnail_generation', {
      status: 'started',
      total: filesToProcess,
      processed: 0
    });

    let generatedCount = 0;
    let skippedCount = 0;

    try {
      const result = await this.processDirectoryForThumbnails(
        thumbnailService,
        downloadsDir,
        downloadsDir,
        filesToProcess,
        (processed) => {
          // Emit progress updates
          this.io.emit('thumbnail_generation', {
            status: 'processing',
            total: filesToProcess,
            processed: processed
          });
        }
      );

      generatedCount = result.generated;
      skippedCount = result.skipped;

      if (generatedCount > 0) {
        console.log(`✓ Generated ${generatedCount} thumbnail(s)`);
      }
      if (skippedCount > 0) {
        console.log(`⚠ Skipped ${skippedCount} file(s) (corrupted or unsupported format)`);
      }

      // Emit completion event
      this.io.emit('thumbnail_generation', {
        status: 'completed',
        total: filesToProcess,
        processed: generatedCount,
        skipped: skippedCount
      });
    } catch (error) {
      console.error('Error during thumbnail indexing:', error);
      this.io.emit('thumbnail_generation', {
        status: 'error',
        error: String(error)
      });
    }
  }

  /**
   * Index and generate missing perceptual hashes in the background
   * This runs on startup to ensure all files have phashes for duplicate detection
   */
  private async indexMissingPhashes(
    phashService: PhashService,
    fsService: FileSystemService,
    downloadsDir: string
  ): Promise<void> {
    console.log('Checking for files missing perceptual hashes...');

    // Query database for records without phash
    const records = await this.dbService.getDownloadsWithoutPhash();

    if (records.length === 0) {
      console.log('✓ All files have perceptual hashes');
      return;
    }

    console.log(`Found ${records.length} files without phash. Generating in background...`);

    // Emit start event
    this.io.emit('phash_generation', {
      status: 'started',
      total: records.length,
      processed: 0
    });

    let processed = 0;
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      for (const record of records) {
        const fullPath = path.join(downloadsDir, record.path);
        processed++;

        // Check if file exists
        if (!fsService.fileExists(fullPath)) {
          skipped++;
          continue;
        }

        // Generate phash
        try {
          const phash = await phashService.generatePhash(fullPath);
          if (phash) {
            const phashStr = Array.isArray(phash) ? JSON.stringify(phash) : phash;
            await this.dbService.updatePhash(record.id, phashStr);
            generated++;
          } else {
            failed++;
          }
        } catch (error: any) {
          console.error(`Failed to generate phash for ${record.filename}:`, error.message);
          failed++;
        }

        // Emit progress every 10 files
        if (processed % 10 === 0 || processed === records.length) {
          this.io.emit('phash_generation', {
            status: 'processing',
            total: records.length,
            processed: processed,
            generated: generated,
            skipped: skipped,
            failed: failed
          });
        }
      }

      // Emit completion
      this.io.emit('phash_generation', {
        status: 'completed',
        total: records.length,
        processed: processed,
        generated: generated,
        skipped: skipped,
        failed: failed
      });

      console.log(`✓ Generated ${generated} perceptual hashes (skipped: ${skipped}, failed: ${failed})`);
    } catch (error) {
      console.error('Error during phash indexing:', error);
      this.io.emit('phash_generation', {
        status: 'error',
        error: String(error)
      });
    }
  }

  private async countFilesNeedingThumbnails(
    thumbnailService: ThumbnailService,
    baseDir: string,
    currentDir: string
  ): Promise<number> {
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
            if (!thumbnailPath) {
              count++;
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error counting files in ${currentDir}:`, error);
    }

    return count;
  }

  private async processDirectoryForThumbnails(
    thumbnailService: ThumbnailService,
    baseDir: string,
    currentDir: string,
    totalFiles: number,
    onProgress: (processed: number) => void
  ): Promise<{ generated: number; skipped: number }> {
    let generatedCount = 0;
    let skippedCount = 0;

    try {
      const items = await fs.readdir(currentDir, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(currentDir, item.name);

        if (item.isDirectory()) {
          // Recursively process subdirectories
          const result = await this.processDirectoryForThumbnails(
            thumbnailService,
            baseDir,
            itemPath,
            totalFiles,
            onProgress
          );
          generatedCount += result.generated;
          skippedCount += result.skipped;
        } else if (item.isFile()) {
          // Check if file needs a thumbnail
          const ext = path.extname(item.name).toLowerCase();
          const isMedia = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.mp4', '.webm', '.gifv', '.mov', '.avi', '.mkv'].includes(ext);

          if (isMedia) {
            const relativePath = path.relative(baseDir, itemPath).replace(/\\/g, '/');
            const thumbnailPath = thumbnailService.getThumbnailPath(relativePath);

            // Generate thumbnail if it doesn't exist
            if (!thumbnailPath) {
              const result = await thumbnailService.generateThumbnail(itemPath, relativePath, true);
              if (result) {
                generatedCount++;
                onProgress(generatedCount);
              } else {
                skippedCount++;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing directory ${currentDir}:`, error);
    }

    return { generated: generatedCount, skipped: skippedCount };
  }

  async run(options: { openBrowser?: boolean; port?: number } = {}): Promise<void> {
    const { openBrowser = true, port = 3000 } = options;
    this.port = port;

    const config = ConfigService.load();
    ConfigService.ensurePostListFile();
    if (!container.isRegistered(CONFIG_TOKEN)) {
        container.register(CONFIG_TOKEN, { useValue: config });
    }
    if (!container.isRegistered(DB_PATH_TOKEN)) {
        container.register(DB_PATH_TOKEN, { useValue: path.join(DATA_DIR, 'data.db') });
    }

    this.dbService = container.resolve(DatabaseService);

    // Initialize thumbnail service
    const thumbnailService = container.resolve(ThumbnailService);
    await thumbnailService.initialize();

    await this.setupRoutes();
    this.setupSockets();

    // Index and generate missing thumbnails in background
    // Wait for socket connections (important for desktop/electron mode)
    const downloadsDir = path.join(DATA_DIR, 'downloads');
    if (await FileUtils.exists(downloadsDir) && !config.testingMode) {
        // Delay to allow browser/electron window to connect to socket.io
        setTimeout(() => {
            this.indexMissingThumbnails(thumbnailService, downloadsDir).catch(err => {
                console.error('Background thumbnail indexing failed:', err);
            });

            // Also index and generate missing phashes in background
            const phashService = container.resolve(PhashService);
            const fsService = container.resolve(FileSystemService);
            this.indexMissingPhashes(phashService, fsService, downloadsDir).catch(err => {
                console.error('Background phash indexing failed:', err);
            });
        }, 2000); // 2 second delay for desktop runner
    }

    return new Promise((resolve, reject) => {
      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, () => {
        const address = this.server.address();
        if (typeof address === 'object' && address !== null) {
          this.port = address.port;
        }

        const url = `http://localhost:${this.port}`;
        console.log(`Web interface running at: ${url}`);
        if (openBrowser) {
          open(url).catch((err) => console.error('Failed to open browser:', err));
        }
        resolve();
      });
    });
  }

  private async setupRoutes() {
    const publicDir = path.join(__dirname, '../../public');
    this.app.use(express.static(publicDir));

    // Define API routes first
    const downloadsDir = path.join(DATA_DIR, 'downloads');
    if (!(await FileUtils.exists(downloadsDir))) {
        await fs.mkdir(downloadsDir, { recursive: true });
    }
    this.app.use('/downloads', express.static(downloadsDir));

    const thumbnailsDir = path.join(DATA_DIR, 'thumbnails');
    if (!(await FileUtils.exists(thumbnailsDir))) {
        await fs.mkdir(thumbnailsDir, { recursive: true });
    }
    this.app.use('/thumbnails', express.static(thumbnailsDir));

    this.app.get('/api/history', async (req, res) => {
        const history = await this.dbService.getSubredditHistory(50);
        res.json(history);
    });

    this.app.get('/api/data-directory', (req, res) => {
        res.json({ path: path.join(DATA_DIR, 'downloads') });
    });

    this.app.get('/api/stats', async (req, res) => {
        try {
            const fsService = container.resolve(FileSystemService);
            const downloadsDir = path.join(DATA_DIR, 'downloads');
            
            const count = await this.dbService.getDownloadCount();
            const totalSize = await fsService.getDirectorySize(downloadsDir);
            
            res.json({ count, totalSize });
        } catch (e) {
            console.error('Failed to get stats:', e);
            res.status(500).json({ error: String(e) });
        }
    });

    this.app.get('/api/browse', async (req, res) => {
        const relPath = (req.query.path as string) || '';

        // Secure path traversal prevention
        const normalizedRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.resolve(downloadsDir, normalizedRelPath);
        const thumbnailsDir = path.join(DATA_DIR, 'thumbnails');
        
        console.log(`[DEBUG] Browse Request: Rel='${relPath}' Full='${fullPath}'`);
        console.log(`[DEBUG] DATA_DIR='${DATA_DIR}' downloadsDir='${downloadsDir}'`);

        // Ensure the resolved path is still within the downloads directory
        if (!fullPath.startsWith(path.resolve(downloadsDir))) {
            return res.status(403).send('Invalid path');
        }

        if (!(await FileUtils.exists(fullPath))) {
            console.log(`[DEBUG] Path does not exist: ${fullPath}`);
            return res.json([]);
        }

        try {
            const items = await fs.readdir(fullPath, { withFileTypes: true });
            console.log(`[DEBUG] Found ${items.length} items in ${fullPath}`);

            // Get all relative paths for files to look up IDs in batch
            const filePaths = items
                .filter(item => !item.isDirectory())
                .map(item => path.join(normalizedRelPath, item.name).replace(/\\/g, '/'));
            
            const dbRecords = await this.dbService.getDownloadRecordsByPaths(filePaths);
            const pathToRecordMap = new Map(dbRecords.map(r => [r.path, r]));

            const result = await Promise.all(items.map(async item => {
                const itemPath = path.join(fullPath, item.name);
                const itemRelativePath = path.join(normalizedRelPath, item.name).replace(/\\/g, '/');

                let size = 0;
                let fileCount = 0;
                let id = 0; // Default for directories or unindexed files

                if (item.isDirectory()) {
                    try {
                        // Open the directory as a stream/iterator
                        const dir = await fs.opendir(itemPath);

                        // Iterate directly without creating an array of items
                        for await (const dirent of dir) {
                            if (dirent.isFile()) {
                                fileCount++;
                            }
                        }
                    } catch (error) {
                        fileCount = 0;
                    }
                } else {
                    const stats = await fs.stat(itemPath);
                    size = stats.size;
                    
                    // Assign database ID if available
                    const record = pathToRecordMap.get(itemRelativePath);
                    if (record) {
                        id = record.id;
                    }
                }

                // Check if thumbnail exists for this file
                const ext = path.extname(item.name).toLowerCase();
                let thumbnailPath = null;

                if (!item.isDirectory()) {
                    const thumbnailRelativePath = itemRelativePath.replace(ext, '.webp');
                    const thumbnailFullPath = path.join(thumbnailsDir, thumbnailRelativePath);
                    if (await FileUtils.exists(thumbnailFullPath)) {
                        thumbnailPath = thumbnailRelativePath;
                    }
                }

                return {
                    id: id,
                    filename: item.name, // Use item.name from fs as filename
                    isDirectory: item.isDirectory(),
                    path: itemRelativePath,
                    size: size,
                    fileCount: fileCount,
                    thumbnail: thumbnailPath
                };
            }));

            result.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.filename.localeCompare(b.filename);
                return a.isDirectory ? -1 : 1;
            });

            res.json(result);
        } catch (e) {
            console.error(e);
            res.json([]);
        }
    });

    this.app.post('/api/delete', async (req, res) => {
        const { files } = req.body;
        if (!Array.isArray(files)) return res.status(400).send('Invalid input');

        const thumbnailService = container.resolve(ThumbnailService);
        let deletedCount = 0;

        // Use for...of to properly await async operations
        for (const relPath of files) {
            // Secure path traversal prevention
            const normalizedRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
            const fullPath = path.resolve(downloadsDir, normalizedRelPath);

            // Ensure the resolved path is still within the downloads directory
            if (!fullPath.startsWith(path.resolve(downloadsDir))) {
                continue;
            }

            if (await FileUtils.exists(fullPath)) {
                try {
                    const stats = await fs.stat(fullPath);

                    if (stats.isDirectory()) {
                        // Delete folder and its thumbnails
                        await fs.rm(fullPath, { recursive: true, force: true });
                        await thumbnailService.deleteThumbnailFolder(normalizedRelPath);
                    } else {
                        // Delete file and its thumbnail
                        await fs.unlink(fullPath);
                        await thumbnailService.deleteThumbnail(normalizedRelPath);
                    }
                    deletedCount++;
                } catch (e) {
                    console.error(`Failed to delete ${fullPath}:`, e);
                }
            }
        }

        res.json({ success: true, deleted: deletedCount });
    });

    this.app.post('/api/start', async (req, res) => {
      if (this.isRunning) {
        return res.status(400).send('Already running');
      }

      const { subreddit, sorting, time, limit } = req.body;
      const numLimit = parseInt(limit) || 0;

      this.startDownloadTask(subreddit, sorting, time, numLimit);

      res.send('Started');
    });

    this.app.post('/api/stop', (req, res) => {
      this.isRunning = false;
      if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
      }
      this.io.emit('log', { message: 'Stopping...' });
      res.send('Stopping');
    });

    // Duplicate detection endpoints
    this.app.get('/api/duplicates', async (req, res) => {
      // Abort any existing scan
      if (this.duplicateScanController) {
        this.duplicateScanController.abort();
      }
      this.duplicateScanController = new AbortController();
      const signal = this.duplicateScanController.signal;

      try {
        const threshold = parseInt(req.query.threshold as string) || 5;
        const phashService = container.resolve(PhashService);
        const thumbnailService = container.resolve(ThumbnailService); // Resolve thumbnail service
        
        // Notify start
        this.io.emit('duplicate_scan_progress', { status: 'started' });

        const result = await phashService.findDuplicates(
          threshold,
          signal,
          (processed, total) => {
            // Emit progress
            this.io.emit('duplicate_scan_progress', {
              status: 'processing',
              processed,
              total
            });
          }
        );

        // Enrich results with thumbnail paths
        // We do this after finding duplicates to avoid slowing down the scan loop
        // It's fast enough for 500 groups usually
        for (const group of result.groups) {
          for (const file of group.files) {
            // DownloadRecord doesn't have thumbnail property typed, but we can add it for the JSON response
            const thumb = thumbnailService.getThumbnailPath(file.path);
            if (thumb) {
              (file as any).thumbnail = thumb;
            }
          }
        }

        this.io.emit('duplicate_scan_progress', { status: 'completed' });
        res.json(result);
      } catch (error: any) {
        if (error.message === 'Duplicate scan cancelled' || signal.aborted) {
          console.log('Duplicate scan cancelled');
          res.status(499).json({ error: 'Cancelled' }); // 499 Client Closed Request
        } else {
          console.error('Error finding duplicates:', error);
          this.io.emit('duplicate_scan_progress', { status: 'error', error: error.message });
          res.status(500).json({ error: error.message });
        }
      } finally {
        this.duplicateScanController = null;
      }
    });

    this.app.post('/api/duplicates/cancel', (req, res) => {
      if (this.duplicateScanController) {
        this.duplicateScanController.abort();
        this.duplicateScanController = null;
        this.io.emit('duplicate_scan_progress', { status: 'cancelled' });
        res.json({ success: true, message: 'Scan cancelled' });
      } else {
        res.json({ success: false, message: 'No scan in progress' });
      }
    });

    this.app.post('/api/generate-phash', async (req, res) => {
      try {
        const phashService = container.resolve(PhashService);
        const fsService = container.resolve(FileSystemService);

        // Get records without phash
        const records = await this.dbService.getDownloadsWithoutPhash();

        if (records.length === 0) {
          return res.json({
            status: 'completed',
            total: 0,
            processed: 0,
            message: 'All files already have perceptual hashes'
          });
        }

        res.json({
          status: 'started',
          total: records.length,
          taskId: `phash_gen_${Date.now()}`
        });

        // Process in background
        setImmediate(async () => {
          let processed = 0;
          let generated = 0;
          let skipped = 0;

          this.io.emit('phash_generation', {
            status: 'started',
            total: records.length,
            processed: 0
          });

          for (const record of records) {
            const fullPath = path.join(downloadsDir, record.path);
            processed++;

            // Check if file exists
            if (!fsService.fileExists(fullPath)) {
              skipped++;
              continue;
            }

            // Generate phash
            try {
              const phash = await phashService.generatePhash(fullPath);
              if (phash) {
                const phashStr = Array.isArray(phash) ? JSON.stringify(phash) : phash;
                await this.dbService.updatePhash(record.id, phashStr);
                generated++;
              }
            } catch (error: any) {
              console.error(`Failed to generate phash for ${record.filename}:`, error);
            }

            // Emit progress every 10 files
            if (processed % 10 === 0 || processed === records.length) {
              this.io.emit('phash_generation', {
                status: 'processing',
                total: records.length,
                processed: processed,
                generated: generated,
                skipped: skipped
              });
            }
          }

          this.io.emit('phash_generation', {
            status: 'completed',
            total: records.length,
            processed: processed,
            generated: generated,
            skipped: skipped
          });
        });
      } catch (error: any) {
        console.error('Error starting phash generation:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/delete-duplicate/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const record = await this.dbService.getDownloadRecord('');

        // Get record to find file path
        const records = await this.dbService.getAllDownloadsWithPhash();
        const targetRecord = records.find(r => r.id === id);

        if (!targetRecord) {
          return res.status(404).json({ error: 'Record not found' });
        }

        // Delete file from disk
        const fullPath = path.join(downloadsDir, targetRecord.path);
        const fsService = container.resolve(FileSystemService);

        if (fsService.fileExists(fullPath)) {
          await fs.unlink(fullPath);
        }

        // Delete thumbnail
        const thumbnailService = container.resolve(ThumbnailService);
        await thumbnailService.deleteThumbnail(targetRecord.path);

        // Delete from database
        await this.dbService.deleteDownload(id);

        res.json({ success: true, message: 'File deleted successfully' });
      } catch (error: any) {
        console.error('Error deleting duplicate:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Catch-all route (must be last)
    this.app.get(/.*/, (req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  private setupSockets() {
    this.io.on('connection', (socket) => {
      socket.emit('status', this.isRunning ? 'running' : 'idle');
    });
  }

  private async startDownloadTask(subreddit: string, sorting: string, time: string, limit: number) {
    this.isRunning = true;
    this.emit('status-change', 'running');
    this.io.emit('status', 'running');
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
        const baseConfig = ConfigService.load();
        const runConfig = { ...baseConfig };

        const socketLogger = (msg: string, detailed: boolean = false) => {
            this.io.emit('log', { message: msg, detailed });
            console.log(msg);
        };

        const fsService = container.resolve(FileSystemService);
        const dbService = this.dbService;
        const apiService = container.resolve(RedditApiService);

        // Configure API rate limiting and logging
        if (runConfig.rate_limit_delay_ms !== undefined) {
          apiService.setMinRequestDelay(runConfig.rate_limit_delay_ms);
        }
        // Connect API service logging to socket logger
        apiService.setLogger(socketLogger);

        const state = new StateService(runConfig);
        state.subredditList = [subreddit];
        state.numberOfPosts = limit === 0 ? ALL_POSTS : limit;
        state.sorting = sorting;
        state.time = time;
        state.startTime = new Date();

        const mockLoggerService = {
            log: socketLogger,
            logWelcome: () => {},
            logValidation: () => {},
            logVersionInfo: () => {},
        };

        const childContainer = container.createChildContainer();
        const { LoggerService } = await import('../services/LoggerService');

        childContainer.register(CONFIG_TOKEN, { useValue: runConfig });
        childContainer.register(LoggerService, { useValue: mockLoggerService as any });

        const scopedDownloadManager = childContainer.resolve(DownloadManager);

        scopedDownloadManager.registerDownloader(childContainer.resolve(GalleryDownloader));
        //scopedDownloadManager.registerDownloader(childContainer.resolve(TextDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(YouTubeDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(RedgifsDownloader));
        //scopedDownloadManager.registerDownloader(childContainer.resolve(LinkDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(MediaDownloader));

        const orchestrator = new DownloadOrchestrator(runConfig, state, apiService, fsService, scopedDownloadManager);

        await orchestrator.downloadBatch({
            target: subreddit,
            logger: {log: socketLogger},
            options: {delayBetweenPosts: 200, signal},
            onProgress: (downloaded: number, total: number) => {
                // Emit progress event
                this.io.emit('progress', { downloaded, total });
            },
            onDownloadedItem: (item: FileItem) => {
                // Push the newly added item to the frontend
                this.io.emit('new_item', item);
            }
        });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'Aborted' || signal.aborted) {
            this.io.emit('log', { message: 'Download cancelled by user.', detailed: false });
        } else {
            this.io.emit('log', { message: `Critical Error: ${message}`, detailed: true });
        }
    } finally {
        this.isRunning = false;
        this.emit('status-change', 'idle');
        this.abortController = null;
        this.io.emit('status', 'idle');
        this.io.emit('log', { message: 'Done.' });
    }
  }
}
