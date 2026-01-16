import 'reflect-metadata';
import { FileSystemService } from '../src/services/FileSystemService';
import { DatabaseService } from '../src/services/DatabaseService';
import { LoggerService } from '../src/services/LoggerService';
import * as path from 'path';
import * as fs from 'fs';

describe('Stats Logic', () => {
  let fsService: FileSystemService;
  const testDataDir = path.join(__dirname, 'temp_stats_test');
  const filesDir = path.join(testDataDir, 'files');

  beforeAll(() => {
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }
    // Create some dummy files
    fs.writeFileSync(path.join(filesDir, 'file1.txt'), 'hello'); // 5 bytes
    fs.writeFileSync(path.join(filesDir, 'file2.txt'), 'world!!'); // 7 bytes
    
    const subDir = path.join(filesDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'file3.txt'), '123'); // 3 bytes
  });

  afterAll(async () => {
    // Wait a bit more for OS to release files
    await new Promise(resolve => setTimeout(resolve, 500));
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it('FileSystemService.getDirectorySize should calculate correct total size', async () => {
    fsService = new FileSystemService();
    const size = await fsService.getDirectorySize(filesDir);
    // 5 + 7 + 3 = 15 bytes
    expect(size).toBe(15);
  });

  it('DatabaseService.getDownloadCount should return 0 for empty database', async () => {
    const mockLogger = { log: jest.fn() } as any;
    const dbPath = path.join(testDataDir, 'test.db');
    const dbService = new DatabaseService(mockLogger, dbPath);
    
    // Wait for the async init to finish (since it's not awaited in constructor)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Initial count should be 0
    const count = await dbService.getDownloadCount();
    expect(count).toBe(0);
    
    dbService.close();
    // Small delay to allow sqlite to release the file handle
    await new Promise(resolve => setTimeout(resolve, 200));
  });
});
