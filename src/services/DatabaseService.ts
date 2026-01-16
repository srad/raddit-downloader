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
  phash: string | null; // Perceptual hash: single hex string for images, JSON array for videos
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

      // Create settings table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      // Migrate old databases that have 'subreddit' column
      this.migrateToSourceColumn();

      // Migrate to add phash column if not exists
      this.migratePHashColumn();

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

  private migratePHashColumn(): void {
    // Check if we need to add the phash column
    this.db.all("PRAGMA table_info(downloads)", (err, columns: Array<{name: string}>) => {
      if (err) return;

      const hasPhash = columns.some(col => col.name === 'phash');

      if (!hasPhash) {
        // Add phash column
        this.db.run("ALTER TABLE downloads ADD COLUMN phash TEXT", (err) => {
          if (err) {
            this.loggerService.log(`Database migration error (phash): ${err.message}`, true);
          } else {
            this.loggerService.log(`Database migrated: 'phash' column added for duplicate detection`, true);
          }
        });
      }
    });
  }

  private createIndexes(): void {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_downloaded_at ON downloads(downloaded_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_source ON downloads(source)',
      'CREATE INDEX IF NOT EXISTS idx_source_downloaded ON downloads(source, downloaded_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_phash ON downloads(phash)'
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

  /**
   * Get multiple download records by their paths
   */
  public async getDownloadRecordsByPaths(paths: string[]): Promise<DownloadRecord[]> {
    if (paths.length === 0) return [];
    
    return new Promise((resolve, reject) => {
      const placeholders = paths.map(() => '?').join(',');
      const sql = `SELECT * FROM downloads WHERE path IN (${placeholders})`;
      
      this.db.all(sql, paths, (err, rows: DownloadRecord[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  public async addDownload(post: RedditPost, filename: string, filePath: string, source: string, phash?: string | null): Promise<number> {
    const sql = `
      INSERT OR IGNORE INTO downloads (post_id, source, url, filename, path, downloaded_at, phash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      post.name, // Fullname (t3_...)
      source, // The subreddit or user profile this was downloaded from
      post.url,
      filename,
      filePath,
      new Date().toISOString(),
      phash || null,
    ];

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
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

  /**
   * Get all download records that have a phash (for duplicate detection)
   */
  public async getAllDownloadsWithPhash(): Promise<DownloadRecord[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM downloads WHERE phash IS NOT NULL',
        [],
        (err, rows: DownloadRecord[]) => {
          if (err) {
            this.loggerService.log(`Database error: ${err.message}`, true);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Get all download records without a phash (for migration/backfill)
   */
  public async getDownloadsWithoutPhash(): Promise<DownloadRecord[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM downloads WHERE phash IS NULL',
        [],
        (err, rows: DownloadRecord[]) => {
          if (err) {
            this.loggerService.log(`Database error: ${err.message}`, true);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Update phash for an existing download record
   */
  public async updatePhash(id: number, phash: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE downloads SET phash = ? WHERE id = ?',
        [phash, id],
        (err) => {
          if (err) {
            this.loggerService.log(`Database update error: ${err.message}`, true);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Delete a download record by ID (for duplicate removal)
   */
  public async deleteDownload(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM downloads WHERE id = ?',
        [id],
        (err) => {
          if (err) {
            this.loggerService.log(`Database delete error: ${err.message}`, true);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Get the total number of downloads in the database
   */
  public async getDownloadCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM downloads', [], (err, row: { count: number }) => {
        if (err) {
          this.loggerService.log(`Database error (count): ${err.message}`, true);
          reject(err);
        } else {
          resolve(row.count || 0);
        }
      });
    });
  }

  public async getSetting(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row: { value: string } | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.value : null);
        }
      });
    });
  }

  public async getAllSettings(): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT key, value FROM settings', [], (err, rows: Array<{ key: string, value: string }>) => {
        if (err) {
          reject(err);
        } else {
          const settings: Record<string, string> = {};
          rows.forEach(row => {
            settings[row.key] = row.value;
          });
          resolve(settings);
        }
      });
    });
  }

  public async setSetting(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  public close(): void {
    this.db.close();
  }
}
