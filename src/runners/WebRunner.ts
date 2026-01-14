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
import { TextDownloader } from '../services/download/TextDownloader';
import { LinkDownloader } from '../services/download/LinkDownloader';
import { GalleryDownloader } from '../services/download/GalleryDownloader';
import { YouTubeDownloader } from '../services/download/YouTubeDownloader';
import { RedgifsDownloader } from '../services/download/RedgifsDownloader';
import { CONFIG_TOKEN, DB_PATH_TOKEN } from '../config/tokens';
import { ALL_POSTS, DATA_DIR } from '../config/constants';
import { Config } from '../types';
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

  constructor() {
    super();
    this.app = express();
    this.server = new Server(this.app);
    this.io = new SocketIOServer(this.server);

    this.app.set('view engine', 'ejs');
    this.app.engine('ejs', require('ejs').__express);
    this.app.set('views', path.join(__dirname, '../../views'));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.json());
  }

  public getPort(): number {
    return this.port;
  }

  public getStatus(): boolean {
    return this.isRunning;
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

    await this.setupRoutes();
    this.setupSockets();

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

    const downloadsDir = path.join(DATA_DIR, 'downloads');
    if (!(await FileUtils.exists(downloadsDir))) {
        await fs.mkdir(downloadsDir, { recursive: true });
    }
    this.app.use('/downloads', express.static(downloadsDir));

    this.app.get('/', async (req, res) => {
      res.render('index', { version: require('../../package.json').version });
    });

    this.app.get('/api/history', async (req, res) => {
        const history = await this.dbService.getSubredditHistory(50);
        res.json(history);
    });

    this.app.get('/api/browse', async (req, res) => {
        const relPath = (req.query.path as string) || '';

        // Secure path traversal prevention
        const normalizedRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.resolve(downloadsDir, normalizedRelPath);

        // Ensure the resolved path is still within the downloads directory
        if (!fullPath.startsWith(path.resolve(downloadsDir))) {
            return res.status(403).send('Invalid path');
        }

        if (!(await FileUtils.exists(fullPath))) return res.json([]);

        try {
            const items = await fs.readdir(fullPath, { withFileTypes: true });

            const result = await Promise.all(items.map(async item => {
                const itemPath = path.join(fullPath, item.name);

                let size = 0;
                let fileCount = 0;

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
                }

                return {
                    name: item.name,
                    isDirectory: item.isDirectory(),
                    path: path.join(normalizedRelPath, item.name).replace(/\\/g, '/'),
                    size: size,
                    fileCount: fileCount
                };
            }));

            result.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
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

        let deletedCount = 0;
        files.forEach(async (relPath: string) => {
            // Secure path traversal prevention
            const normalizedRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
            const fullPath = path.resolve(downloadsDir, normalizedRelPath);

            // Ensure the resolved path is still within the downloads directory
            if (!fullPath.startsWith(path.resolve(downloadsDir))) {
                return;
            }

            if (await FileUtils.exists(fullPath)) {
                try {
                    if ((await fs.stat(fullPath)).isDirectory()) {
                        await fs.rm(fullPath, { recursive: true, force: true });
                    } else {
                        await fs.unlink(fullPath);
                    }
                    deletedCount++;
                } catch (e) {
                    console.error(`Failed to delete ${fullPath}:`, e);
                }
            }
        });
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

        const downloadManager = new DownloadManager(mockLoggerService as any, runConfig, dbService, fsService);

        const childContainer = container.createChildContainer();
        const { LoggerService } = await import('../services/LoggerService');

        childContainer.register(CONFIG_TOKEN, { useValue: runConfig });
        childContainer.register(LoggerService, { useValue: mockLoggerService as any });

        const scopedDownloadManager = childContainer.resolve(DownloadManager);

        scopedDownloadManager.registerDownloader(childContainer.resolve(GalleryDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(TextDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(YouTubeDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(RedgifsDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(LinkDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(MediaDownloader));

        const orchestrator = new DownloadOrchestrator(runConfig, state, apiService, fsService, scopedDownloadManager);

        await orchestrator.downloadBatch({
            target: subreddit,
            logger: {log: socketLogger},
            options: {delayBetweenPosts: 200, signal},
            onProgress: (downloaded: number, total: number) => {
                // Emit progress event
                this.io.emit('progress', { downloaded, total });

                // throttle file refresh
                if (downloaded % 10 === 0) {
                    this.io.emit('refresh_files');
                }
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
        this.io.emit('refresh_files');
    }
  }
}
