import { Runner } from './Runner';
import express from 'express';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import * as path from 'path';
import * as fs from 'fs';
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
import { CONFIG_TOKEN } from '../config/tokens';
import { ALL_POSTS, DATA_DIR } from '../config/constants';
import { Config } from '../types';

@injectable()
export class WebRunner implements Runner {
  private app: express.Application;
  private server: Server;
  private io: SocketIOServer;
  private readonly PORT = 3000;
  private isRunning = false;
  private dbService!: DatabaseService;
  private abortController: AbortController | null = null;

  constructor() {
    this.app = express();
    this.server = new Server(this.app);
    this.io = new SocketIOServer(this.server);
    
    this.app.set('view engine', 'ejs');
    this.app.engine('ejs', require('ejs').__express);
    this.app.set('views', path.join(__dirname, '../../views'));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.json());
  }

  async run(): Promise<void> {
    const config = ConfigService.load();
    ConfigService.ensurePostListFile();
    if (!container.isRegistered(CONFIG_TOKEN)) {
        container.register(CONFIG_TOKEN, { useValue: config });
    }

    this.dbService = container.resolve(DatabaseService);

    this.setupRoutes();
    this.setupSockets();

    this.server.listen(this.PORT, async () => {
      const url = `http://localhost:${this.PORT}`;
      console.log(`Web interface running at: ${url}`);
      await open(url);
    });
  }

  private setupRoutes() {
    const publicDir = path.join(__dirname, '../../public');
    this.app.use(express.static(publicDir));

    const downloadsDir = path.join(DATA_DIR, 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }
    this.app.use('/downloads', express.static(downloadsDir));

    this.app.get('/', async (req, res) => {
      res.render('index', { version: require('../../package.json').version });
    });

    this.app.get('/api/history', async (req, res) => {
        const history = await this.dbService.getSubredditHistory(50);
        res.json(history);
    });

    this.app.get('/api/browse', (req, res) => {
        const relPath = (req.query.path as string) || '';

        // Secure path traversal prevention
        const normalizedRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.resolve(downloadsDir, normalizedRelPath);

        // Ensure the resolved path is still within the downloads directory
        if (!fullPath.startsWith(path.resolve(downloadsDir))) {
            return res.status(403).send('Invalid path');
        }

        if (!fs.existsSync(fullPath)) return res.json([]);

        try {
            const items = fs.readdirSync(fullPath, { withFileTypes: true });
            const result = items.map(item => {
                const itemPath = path.join(fullPath, item.name);
                const size = item.isDirectory() ? 0 : fs.statSync(itemPath).size;
                return {
                    name: item.name,
                    isDirectory: item.isDirectory(),
                    path: path.join(normalizedRelPath, item.name).replace(/\\/g, '/'),
                    size: size
                };
            });
            
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

    this.app.post('/api/delete', (req, res) => {
        const { files } = req.body;
        if (!Array.isArray(files)) return res.status(400).send('Invalid input');

        let deletedCount = 0;
        files.forEach((relPath: string) => {
            // Secure path traversal prevention
            const normalizedRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
            const fullPath = path.resolve(downloadsDir, normalizedRelPath);

            // Ensure the resolved path is still within the downloads directory
            if (!fullPath.startsWith(path.resolve(downloadsDir))) {
                return;
            }

            if (fs.existsSync(fullPath)) {
                try {
                    if (fs.statSync(fullPath).isDirectory()) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(fullPath);
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

        const downloadManager = new DownloadManager(mockLoggerService as any, runConfig, dbService);
        
        const childContainer = container.createChildContainer();
        const { LoggerService } = await import('../services/LoggerService');
        
        childContainer.register(CONFIG_TOKEN, { useValue: runConfig });
        childContainer.register(LoggerService, { useValue: mockLoggerService as any });
        
        const scopedDownloadManager = childContainer.resolve(DownloadManager);

        scopedDownloadManager.registerDownloader(childContainer.resolve(GalleryDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(TextDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(YouTubeDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(LinkDownloader));
        scopedDownloadManager.registerDownloader(childContainer.resolve(MediaDownloader));

        const orchestrator = new DownloadOrchestrator(runConfig, state, apiService, fsService, scopedDownloadManager);

        await orchestrator.downloadBatch(subreddit, { log: socketLogger }, { delayBetweenPosts: 200, signal });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'Aborted' || signal.aborted) {
            this.io.emit('log', { message: 'Download cancelled by user.', detailed: false });
        } else {
            this.io.emit('log', { message: `Critical Error: ${message}`, detailed: true });
        }
    } finally {
        this.isRunning = false;
        this.abortController = null;
        this.io.emit('status', 'idle');
        this.io.emit('log', { message: 'Done.' });
        this.io.emit('refresh_files');
    }
  }
}
