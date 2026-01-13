import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { LoggerService } from '../services/LoggerService';
import { RedditPost } from '../types';
import { singleton, inject } from 'tsyringe';
import { DATA_DIR } from '../config/constants';

export interface DownloadRecord {
  id: number;
  post_id: string;
  subreddit: string;
  url: string;
  filename: string;
  path: string;
  downloaded_at: string;
}

@singleton()
export class DatabaseService {
  private db: sqlite3.Database;
  private readonly DB_PATH = path.join(DATA_DIR, 'history.db');

  constructor(@inject(LoggerService) private loggerService: LoggerService) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    this.db = new sqlite3.Database(this.DB_PATH, (err) => {
      if (err) {
        this.loggerService.log(`ERROR: Could not connect to database: ${err.message}`, true);
      } else {
        this.init();
      }
    });
  }

  private init(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT UNIQUE,
        subreddit TEXT,
        url TEXT,
        filename TEXT,
        path TEXT,
        downloaded_at TEXT
      )
    `;

    this.db.run(sql, (err) => {
      if (err) {
        this.loggerService.log(`ERROR: Could not create table: ${err.message}`, true);
      }
    });
  }

  public async isDownloaded(postId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT id FROM downloads WHERE post_id = ?', [postId], (err, row) => {
        if (err) {
          this.loggerService.log(`Database error: ${err.message}`, true);
          reject(err);
        } else {
          resolve(!!row);
        }
      });
    });
  }

  public async addDownload(post: RedditPost, filename: string, filePath: string): Promise<void> {
    const sql = `
      INSERT OR IGNORE INTO downloads (post_id, subreddit, url, filename, path, downloaded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [
      post.name, // Fullname (t3_...)
      post.subreddit,
      post.url,
      filename,
      filePath,
      new Date().toISOString(),
    ];

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) {
          this.loggerService.log(`Database insert error: ${err.message}`, true);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public close(): void {
    this.db.close();
  }
}
