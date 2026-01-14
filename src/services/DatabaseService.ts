import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { LoggerService } from '../services/LoggerService';
import { RedditPost } from '../types';
import { singleton, inject } from 'tsyringe';
import { DATA_DIR } from '../config/constants';
import { DB_PATH_TOKEN } from '../config/tokens';

export interface DownloadRecord {
  id: number;
  post_id: string;
  source: string; // The subreddit or user profile where this was downloaded from
  url: string;
  filename: string;
  path: string;
  downloaded_at: string;
}

@singleton()
export class DatabaseService {
  private db: sqlite3.Database;
  private readonly DB_PATH: string;

  constructor(
    @inject(LoggerService) private loggerService: LoggerService,
    @inject(DB_PATH_TOKEN) dbPath?: string
  ) {
    this.DB_PATH = dbPath || path.join(DATA_DIR, 'data.db');
    const dbDir = path.dirname(this.DB_PATH);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
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
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT UNIQUE,
        source TEXT,
        url TEXT,
        filename TEXT,
        path TEXT,
        downloaded_at TEXT
      )
    `;

    this.db.run(createTableSql, (err) => {
      if (err) {
        this.loggerService.log(`ERROR: Could not create table: ${err.message}`, true);
        return;
      }

      // Migrate old databases that have 'subreddit' column
      this.migrateToSourceColumn();

      // Create indexes for frequently queried columns
      this.createIndexes();
    });
  }

  private migrateToSourceColumn(): void {
    // Check if we need to migrate from subreddit to source column
    this.db.all("PRAGMA table_info(downloads)", (err, columns: Array<{name: string}>) => {
      if (err) return;

      const hasSubreddit = columns.some(col => col.name === 'subreddit');
      const hasSource = columns.some(col => col.name === 'source');

      if (hasSubreddit && !hasSource) {
        // Old schema: rename subreddit to source
        this.db.run("ALTER TABLE downloads RENAME COLUMN subreddit TO source", (err) => {
          if (err) {
            this.loggerService.log(`Database migration error: ${err.message}`, true);
          } else {
            this.loggerService.log(`Database migrated: 'subreddit' column renamed to 'source'`, true);
          }
        });
      } else if (hasSubreddit && hasSource) {
        // Both exist: copy subreddit to source where source is null, then drop subreddit
        this.db.serialize(() => {
          this.db.run("UPDATE downloads SET source = subreddit WHERE source IS NULL");
          // Note: SQLite doesn't support DROP COLUMN before 3.35.0
          // For older SQLite, we'll just leave it
          this.db.run("ALTER TABLE downloads DROP COLUMN subreddit", (err) => {
            if (err && !err.message.includes("no such column")) {
              // Ignore if column doesn't exist or SQLite version doesn't support DROP COLUMN
            }
          });
        });
      }
    });
  }

  private createIndexes(): void {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_downloaded_at ON downloads(downloaded_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_source ON downloads(source)',
      'CREATE INDEX IF NOT EXISTS idx_source_downloaded ON downloads(source, downloaded_at DESC)'
    ];

    indexes.forEach((sql) => {
      this.db.run(sql, (err) => {
        if (err) {
          this.loggerService.log(`ERROR: Could not create index: ${err.message}`, true);
        }
      });
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

  public async getDownloadRecord(postId: string): Promise<DownloadRecord | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM downloads WHERE post_id = ?',
        [postId],
        (err, row: DownloadRecord | undefined) => {
          if (err) {
            this.loggerService.log(`Database error: ${err.message}`, true);
            reject(err);
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  public async addDownload(post: RedditPost, filename: string, filePath: string, source: string): Promise<void> {
    const sql = `
      INSERT OR IGNORE INTO downloads (post_id, source, url, filename, path, downloaded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [
      post.name, // Fullname (t3_...)
      source, // The subreddit or user profile this was downloaded from
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

  public async getSourceHistory(limit: number = 20): Promise<string[]> {
    return new Promise((resolve, reject) => {
      // Use GROUP BY for better performance with the composite index
      const sql = `
        SELECT source
        FROM downloads
        GROUP BY source
        ORDER BY MAX(downloaded_at) DESC
        LIMIT ?
      `;

      this.db.all(sql, [limit], (err, rows: Array<{ source: string }>) => {
        if (err) {
          this.loggerService.log(`Database error: ${err.message}`, true);
          resolve([]); // Return empty on error
        } else {
          resolve(rows.map(r => r.source));
        }
      });
    });
  }

  // Deprecated: Use getSourceHistory instead
  public async getSubredditHistory(limit: number = 20): Promise<string[]> {
    return this.getSourceHistory(limit);
  }

  public close(): void {
    this.db.close();
  }
}
