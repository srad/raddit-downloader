import 'reflect-metadata';
import { DownloadManager } from '../src/services/download/DownloadManager';
import { RedditPost, Config } from '../src/types';
import { LoggerService } from '../src/services/LoggerService';
import { DatabaseService } from '../src/services/DatabaseService';
import { FileSystemService } from '../src/services/FileSystemService';
import { ThumbnailService } from '../src/services/ThumbnailService';
import { PhashService } from '../src/services/PhashService';
import * as path from 'path';

describe('DownloadManager', () => {
  let downloadManager: DownloadManager;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockConfig: Config;
  let mockDb: jest.Mocked<DatabaseService>;
  let mockFs: jest.Mocked<FileSystemService>;
  let mockThumb: jest.Mocked<ThumbnailService>;
  let mockPhash: jest.Mocked<PhashService>;

  const mockPost: RedditPost = {
    name: 't3_test',
    title: 'Test Post',
    url: 'https://example.com/image.jpg',
    subreddit: 'pics',
    author: 'user',
    created: 123456789,
    score: 100,
    domain: 'example.com'
  };

  beforeEach(() => {
    mockLogger = { log: jest.fn() } as any;
    mockConfig = {
      use_history_database: true,
      prevent_duplicates: true,
      duplicate_threshold: 5
    } as any;
    mockDb = {
      getDownloadRecord: jest.fn().mockResolvedValue(null),
      addDownload: jest.fn().mockResolvedValue(undefined)
    } as any;
    mockFs = {
      fileExists: jest.fn().mockReturnValue(false),
      deleteFile: jest.fn().mockResolvedValue(undefined)
    } as any;
    mockThumb = {
      generateThumbnail: jest.fn().mockResolvedValue('thumb.webp')
    } as any;
    mockPhash = {
      generatePhash: jest.fn().mockResolvedValue('abc123hash'),
      findDuplicate: jest.fn().mockResolvedValue(null)
    } as any;

    downloadManager = new DownloadManager(
      mockLogger,
      mockConfig,
      mockDb,
      mockFs,
      mockThumb,
      mockPhash
    );

    // Mock a downloader
    const mockDownloader = {
      canHandle: jest.fn().mockReturnValue(true),
      download: jest.fn().mockResolvedValue('image.jpg'),
      constructor: { name: 'MediaDownloader' }
    };
    downloadManager.registerDownloader(mockDownloader as any);
  });

  it('should download a post successfully when no duplicate exists', async () => {
    const result = await downloadManager.download(mockPost, '/tmp', 'test_file');

    expect(result).toBe(true);
    expect(mockDb.addDownload).toHaveBeenCalled();
    expect(mockFs.deleteFile).not.toHaveBeenCalled();
  });

  it('should skip download if post ID already exists in database and file is on disk', async () => {
    mockDb.getDownloadRecord.mockResolvedValue({
      path: 'pics/image.jpg',
      filename: 'image.jpg'
    } as any);
    mockFs.fileExists.mockReturnValue(true);

    const result = await downloadManager.download(mockPost, '/tmp', 'test_file');

    expect(result).toBe(false);
    expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Skipping duplicate (file exists)'), true);
  });

  it('should active prevent duplicates if pHash match is found', async () => {
    // 1. First download happens
    // 2. Phash is generated
    mockPhash.generatePhash.mockResolvedValue('duplicate_hash');
    
    // 3. Duplicate check finds something
    mockPhash.findDuplicate.mockResolvedValue({
      filename: 'original.jpg',
      source: 'r_pics'
    } as any);

    const result = await downloadManager.download(mockPost, '/tmp', 'test_file');

    // Should return false (skipped)
    expect(result).toBe(false);
    
    // Should have deleted the file it just downloaded
    expect(mockFs.deleteFile).toHaveBeenCalled();
    
    // Should NOT have added it to the database
    expect(mockDb.addDownload).not.toHaveBeenCalled();
    
    expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Duplicate detected (content match)'), true);
  });

  it('should not prevent duplicates if prevent_duplicates is disabled', async () => {
    mockConfig.prevent_duplicates = false;
    mockPhash.findDuplicate.mockResolvedValue({ filename: 'original.jpg' } as any);

    const result = await downloadManager.download(mockPost, '/tmp', 'test_file');

    expect(result).toBe(true);
    expect(mockFs.deleteFile).not.toHaveBeenCalled();
    expect(mockDb.addDownload).toHaveBeenCalled();
  });
});
