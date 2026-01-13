import { Downloader } from './Downloader';
import { RedditPost, Config } from '../../types';
import { LoggerService } from '../LoggerService';
import { DatabaseService } from '../DatabaseService';
import { singleton, inject } from 'tsyringe';
import { CONFIG_TOKEN } from '../../config/tokens';

@singleton()
export class DownloadManager {
  private downloaders: Downloader[] = [];

  constructor(
    @inject(LoggerService) private loggerService: LoggerService,
    @inject(CONFIG_TOKEN) private config: Config,
    @inject(DatabaseService) private dbService: DatabaseService
  ) {}

  public registerDownloader(downloader: Downloader): void {
    this.downloaders.push(downloader);
  }

  public async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<void> {
    // Check History DB
    if (
      this.dbService && 
      this.config.use_history_database !== false && 
      !this.config.redownload_posts
    ) {
      const alreadyDownloaded = await this.dbService.isDownloaded(post.name);
      if (alreadyDownloaded) {
        return; 
      }
    }

    for (const downloader of this.downloaders) {
      if (downloader.canHandle(post)) {
        await downloader.download(post, targetDir, filenameBase);
        
        if (this.dbService && this.config.use_history_database !== false) {
           await this.dbService.addDownload(post, filenameBase, targetDir);
        }
        return;
      }
    }
    this.loggerService.log(`No downloader found for post: ${post.title}`, true);
  }
}
