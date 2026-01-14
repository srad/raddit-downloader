import 'reflect-metadata';
import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseService } from '../src/services/DatabaseService';
import { LoggerService } from '../src/services/LoggerService';
import { DATA_DIR } from '../src/config/constants';

describe('DatabaseService Migration', () => {
  let dbService: DatabaseService;
  let mockLogger: jest.Mocked<LoggerService>;
  let testDbPath: string;
  let testDownloadsDir: string;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      logWelcome: jest.fn(),
      logValidation: jest.fn(),
      logVersionInfo: jest.fn(),
    } as any;

    // Use a test database
    testDbPath = path.join(__dirname, 'test_migration.db');
    // Migration expects downloads dir to be in same directory as database
    testDownloadsDir = path.join(__dirname, 'downloads');

    // Clean up if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDownloadsDir)) {
      fs.rmSync(testDownloadsDir, { recursive: true, force: true });
    }

    // Create test downloads directory structure
    fs.mkdirSync(testDownloadsDir, { recursive: true });
    fs.mkdirSync(path.join(testDownloadsDir, 'r_pics'), { recursive: true });
    fs.mkdirSync(path.join(testDownloadsDir, 'u_testuser'), { recursive: true });

    // Create test files
    fs.writeFileSync(path.join(testDownloadsDir, 'r_pics', 'oldfile1.jpg'), 'test');
    fs.writeFileSync(path.join(testDownloadsDir, 'r_pics', 'oldfile2.mp4'), 'test');
    fs.writeFileSync(path.join(testDownloadsDir, 'u_testuser', 'userpost.jpg'), 'test');
  });

  afterEach(() => {
    if (dbService) {
      dbService.close();
    }

    // Clean up test files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDownloadsDir)) {
      fs.rmSync(testDownloadsDir, { recursive: true, force: true });
    }
  });

  const createTestDatabase = (records: any[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(testDbPath);

      db.serialize(() => {
        db.run(`
          CREATE TABLE downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id TEXT UNIQUE,
            source TEXT,
            url TEXT,
            filename TEXT,
            path TEXT,
            downloaded_at TEXT
          )
        `);

        const stmt = db.prepare(
          'INSERT INTO downloads (post_id, source, url, filename, path, downloaded_at) VALUES (?, ?, ?, ?, ?, ?)'
        );

        records.forEach((record) => {
          stmt.run(
            record.post_id,
            record.source,
            record.url,
            record.filename,
            record.path,
            record.downloaded_at
          );
        });

        stmt.finalize();
        db.close(() => resolve());
      });
    });
  };

  const readRecordsFromDb = (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(testDbPath);
      db.all('SELECT * FROM downloads', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
        db.close();
      });
    });
  };

  it('should migrate absolute paths to relative paths', async () => {
    const oldRecords = [
      {
        post_id: 't3_abc123',
        source: 'pics',
        url: 'https://i.redd.it/test.jpg',
        filename: 'oldfile1',
        path: path.join(testDownloadsDir, 'r_pics'),
        downloaded_at: '2024-01-01T00:00:00Z',
      },
    ];

    await createTestDatabase(oldRecords);

    // Create DatabaseService with test database path - this will trigger migration
    dbService = new DatabaseService(mockLogger, testDbPath);

    // Wait for migration to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    const records = await readRecordsFromDb();

    expect(records).toHaveLength(1);
    expect(records[0].path).toBe('r_pics/oldfile1.jpg');
    expect(records[0].filename).toBe('oldfile1.jpg');
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Database migrated'),
      true
    );
  });

  it('should handle multiple records with different file types', async () => {
    const oldRecords = [
      {
        post_id: 't3_abc123',
        source: 'pics',
        url: 'https://i.redd.it/test1.jpg',
        filename: 'oldfile1',
        path: path.join(testDownloadsDir, 'r_pics'),
        downloaded_at: '2024-01-01T00:00:00Z',
      },
      {
        post_id: 't3_def456',
        source: 'pics',
        url: 'https://v.redd.it/test2.mp4',
        filename: 'oldfile2',
        path: path.join(testDownloadsDir, 'r_pics'),
        downloaded_at: '2024-01-01T00:00:00Z',
      },
    ];

    await createTestDatabase(oldRecords);

    dbService = new DatabaseService(mockLogger, testDbPath);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const records = await readRecordsFromDb();

    expect(records).toHaveLength(2);
    expect(records[0].path).toBe('r_pics/oldfile1.jpg');
    expect(records[0].filename).toBe('oldfile1.jpg');
    expect(records[1].path).toBe('r_pics/oldfile2.mp4');
    expect(records[1].filename).toBe('oldfile2.mp4');
  });

  it('should handle user profile paths', async () => {
    const oldRecords = [
      {
        post_id: 't3_user123',
        source: 'user/testuser',
        url: 'https://i.redd.it/userpost.jpg',
        filename: 'userpost',
        path: path.join(testDownloadsDir, 'u_testuser'),
        downloaded_at: '2024-01-01T00:00:00Z',
      },
    ];

    await createTestDatabase(oldRecords);

    dbService = new DatabaseService(mockLogger, testDbPath);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const records = await readRecordsFromDb();

    expect(records).toHaveLength(1);
    expect(records[0].path).toBe('u_testuser/userpost.jpg');
    expect(records[0].filename).toBe('userpost.jpg');
  });

  it('should skip records that are already migrated', async () => {
    const newFormatRecords = [
      {
        post_id: 't3_new123',
        source: 'pics',
        url: 'https://i.redd.it/test.jpg',
        filename: 'newfile.jpg',
        path: 'r_pics/newfile.jpg',
        downloaded_at: '2024-01-01T00:00:00Z',
      },
    ];

    await createTestDatabase(newFormatRecords);

    dbService = new DatabaseService(mockLogger, testDbPath);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const records = await readRecordsFromDb();

    // Should remain unchanged
    expect(records).toHaveLength(1);
    expect(records[0].path).toBe('r_pics/newfile.jpg');
    expect(records[0].filename).toBe('newfile.jpg');
  });

  it('should skip records where file cannot be found', async () => {
    const oldRecords = [
      {
        post_id: 't3_missing123',
        source: 'pics',
        url: 'https://i.redd.it/missing.jpg',
        filename: 'missingfile',
        path: path.join(testDownloadsDir, 'r_pics'),
        downloaded_at: '2024-01-01T00:00:00Z',
      },
    ];

    await createTestDatabase(oldRecords);

    dbService = new DatabaseService(mockLogger, testDbPath);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const records = await readRecordsFromDb();

    // Should remain unchanged if file not found
    expect(records).toHaveLength(1);
    expect(records[0].path).toBe(path.join(testDownloadsDir, 'r_pics'));
    expect(records[0].filename).toBe('missingfile');
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Could not find file for record'),
      true
    );
  });

  it('should handle mixed old and new format records', async () => {
    const mixedRecords = [
      {
        post_id: 't3_old123',
        source: 'pics',
        url: 'https://i.redd.it/test1.jpg',
        filename: 'oldfile1',
        path: path.join(testDownloadsDir, 'r_pics'),
        downloaded_at: '2024-01-01T00:00:00Z',
      },
      {
        post_id: 't3_new456',
        source: 'pics',
        url: 'https://i.redd.it/test2.jpg',
        filename: 'newfile.jpg',
        path: 'r_pics/newfile.jpg',
        downloaded_at: '2024-01-01T00:00:00Z',
      },
    ];

    await createTestDatabase(mixedRecords);

    dbService = new DatabaseService(mockLogger, testDbPath);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const records = await readRecordsFromDb();

    expect(records).toHaveLength(2);

    // Old record should be migrated
    const oldRecord = records.find((r) => r.post_id === 't3_old123');
    expect(oldRecord.path).toBe('r_pics/oldfile1.jpg');
    expect(oldRecord.filename).toBe('oldfile1.jpg');

    // New record should remain unchanged
    const newRecord = records.find((r) => r.post_id === 't3_new456');
    expect(newRecord.path).toBe('r_pics/newfile.jpg');
    expect(newRecord.filename).toBe('newfile.jpg');
  });
});
