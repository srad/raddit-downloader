import 'reflect-metadata';
import { ThumbnailService } from '../src/services/ThumbnailService';
import { FileSystemService } from '../src/services/FileSystemService';
import { LoggerService } from '../src/services/LoggerService';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DATA_DIR } from '../src/config/constants';

// Mock dependencies
jest.mock('../src/services/FileSystemService');
jest.mock('../src/services/LoggerService');
jest.mock('fs/promises');
jest.mock('sharp', () => {
  return jest.fn(() => ({
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue(undefined),
  }));
});

describe('ThumbnailService', () => {
  let thumbnailService: ThumbnailService;
  let mockFsService: jest.Mocked<FileSystemService>;
  let mockLoggerService: jest.Mocked<LoggerService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockFsService = {
      fileExists: jest.fn(),
      createWriteStream: jest.fn(),
      deleteFile: jest.fn(),
    } as any;

    mockLoggerService = {
      log: jest.fn(),
      logWelcome: jest.fn(),
      logValidation: jest.fn(),
      logVersionInfo: jest.fn(),
    } as any;

    // Mock fs.mkdir
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

    thumbnailService = new ThumbnailService(mockFsService, mockLoggerService);
  });

  describe('initialize', () => {
    it('should create thumbnail directory', async () => {
      await thumbnailService.initialize();

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(DATA_DIR, 'thumbnails'),
        { recursive: true }
      );
    });

    it('should handle errors during directory creation', async () => {
      const error = new Error('Permission denied');
      (fs.mkdir as jest.Mock).mockRejectedValue(error);

      await thumbnailService.initialize();

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create thumbnail directory'),
        true
      );
    });
  });

  describe('generateThumbnail', () => {
    it('should skip generation if thumbnail already exists', async () => {
      const filePath = '/downloads/r_pics/image.jpg';
      const relativePath = 'r_pics/image.jpg';

      mockFsService.fileExists.mockReturnValue(true);

      const result = await thumbnailService.generateThumbnail(filePath, relativePath);

      expect(result).toBe('r_pics/image.webp');
      expect(mockLoggerService.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Generated thumbnail'),
        true
      );
    });

    it('should return null for unsupported file types', async () => {
      const filePath = '/downloads/r_pics/document.pdf';
      const relativePath = 'r_pics/document.pdf';

      mockFsService.fileExists.mockReturnValue(false);

      const result = await thumbnailService.generateThumbnail(filePath, relativePath);

      expect(result).toBeNull();
    });

    it('should create subdirectory for thumbnail', async () => {
      const filePath = '/downloads/r_pics/subfolder/image.jpg';
      const relativePath = 'r_pics/subfolder/image.jpg';

      mockFsService.fileExists.mockReturnValue(false);

      await thumbnailService.generateThumbnail(filePath, relativePath);

      const expectedPath = path.join(DATA_DIR, 'thumbnails', 'r_pics', 'subfolder');
      expect(fs.mkdir).toHaveBeenCalledWith(
        expectedPath,
        { recursive: true }
      );
    });

    it('should handle errors during thumbnail generation', async () => {
      const filePath = '/downloads/r_pics/image.jpg';
      const relativePath = 'r_pics/image.jpg';

      mockFsService.fileExists.mockReturnValue(false);

      // Mock sharp to throw error
      const sharp = require('sharp');
      sharp.mockImplementationOnce(() => ({
        resize: jest.fn().mockReturnThis(),
        webp: jest.fn().mockReturnThis(),
        toFile: jest.fn().mockRejectedValue(new Error('Sharp error')),
      }));

      const result = await thumbnailService.generateThumbnail(filePath, relativePath);

      expect(result).toBeNull();
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate thumbnail'),
        true
      );
    });
  });

  describe('deleteThumbnail', () => {
    it('should delete thumbnail if it exists', async () => {
      const relativePath = 'r_pics/image.jpg';
      mockFsService.fileExists.mockReturnValue(true);
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await thumbnailService.deleteThumbnail(relativePath);

      const expectedPath = path.join(DATA_DIR, 'thumbnails', 'r_pics', 'image.webp');
      expect(fs.unlink).toHaveBeenCalledWith(expectedPath);
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Deleted thumbnail'),
        true
      );
    });

    it('should do nothing if thumbnail does not exist', async () => {
      const relativePath = 'r_pics/image.jpg';
      mockFsService.fileExists.mockReturnValue(false);

      await thumbnailService.deleteThumbnail(relativePath);

      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should handle errors during deletion', async () => {
      const relativePath = 'r_pics/image.jpg';
      mockFsService.fileExists.mockReturnValue(true);
      (fs.unlink as jest.Mock).mockRejectedValue(new Error('Deletion failed'));

      await thumbnailService.deleteThumbnail(relativePath);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete thumbnail'),
        true
      );
    });
  });

  describe('deleteThumbnailFolder', () => {
    it('should delete thumbnail folder if it exists', async () => {
      const relativePath = 'r_pics/subfolder';
      mockFsService.fileExists.mockReturnValue(true);
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      await thumbnailService.deleteThumbnailFolder(relativePath);

      const expectedPath = path.join(DATA_DIR, 'thumbnails', 'r_pics', 'subfolder');
      expect(fs.rm).toHaveBeenCalledWith(
        expectedPath,
        { recursive: true, force: true }
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Deleted thumbnail folder'),
        true
      );
    });

    it('should do nothing if folder does not exist', async () => {
      const relativePath = 'r_pics/subfolder';
      mockFsService.fileExists.mockReturnValue(false);

      await thumbnailService.deleteThumbnailFolder(relativePath);

      expect(fs.rm).not.toHaveBeenCalled();
    });

    it('should handle errors during folder deletion', async () => {
      const relativePath = 'r_pics/subfolder';
      mockFsService.fileExists.mockReturnValue(true);
      (fs.rm as jest.Mock).mockRejectedValue(new Error('Deletion failed'));

      await thumbnailService.deleteThumbnailFolder(relativePath);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete thumbnail folder'),
        true
      );
    });
  });

  describe('getThumbnailPath', () => {
    it('should return thumbnail path if it exists', () => {
      const relativePath = 'r_pics/image.jpg';
      mockFsService.fileExists.mockReturnValue(true);

      const result = thumbnailService.getThumbnailPath(relativePath);

      expect(result).toBe('r_pics/image.webp');
    });

    it('should return null if thumbnail does not exist', () => {
      const relativePath = 'r_pics/image.jpg';
      mockFsService.fileExists.mockReturnValue(false);

      const result = thumbnailService.getThumbnailPath(relativePath);

      expect(result).toBeNull();
    });
  });

  describe('cleanupOrphanedThumbnails', () => {
    it('should clean up orphaned thumbnails', async () => {
      const downloadsDir = '/downloads';

      // Mock directory structure
      mockFsService.fileExists.mockReturnValue(true);
      (fs.readdir as jest.Mock).mockResolvedValue([
        { name: 'image1.webp', isFile: () => true, isDirectory: () => false },
        { name: 'image2.webp', isFile: () => true, isDirectory: () => false },
      ]);

      // image1 has original, image2 doesn't
      mockFsService.fileExists
        .mockReturnValueOnce(true) // thumbnail dir exists
        .mockReturnValueOnce(false) // image1.jpg doesn't exist (will check all extensions)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true) // image1.png exists (found it!)
        .mockReturnValueOnce(false) // image2 doesn't exist with any extension
        .mockReturnValueOnce(false);

      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      const result = await thumbnailService.cleanupOrphanedThumbnails(downloadsDir);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Starting orphaned thumbnail cleanup...',
        false
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup complete'),
        false
      );
    });

    it('should handle errors during cleanup', async () => {
      const downloadsDir = '/downloads';

      mockFsService.fileExists.mockReturnValue(true);
      (fs.readdir as jest.Mock).mockRejectedValue(new Error('Read error'));

      const result = await thumbnailService.cleanupOrphanedThumbnails(downloadsDir);

      expect(result).toBe(0);
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Error processing thumbnail directory'),
        true
      );
    });
  });

  describe('batchGenerateThumbnails', () => {
    it('should log start and completion messages', async () => {
      const downloadsDir = '/downloads';

      mockFsService.fileExists.mockReturnValue(false);
      (fs.readdir as jest.Mock).mockResolvedValue([]);

      await thumbnailService.batchGenerateThumbnails(downloadsDir);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Starting batch thumbnail generation...',
        false
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Batch thumbnail generation complete.',
        false
      );
    });
  });
});
