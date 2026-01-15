import 'reflect-metadata';
import { MediaDownloader } from '../src/services/download/MediaDownloader';
import { FileSystemService } from '../src/services/FileSystemService';
import { LoggerService } from '../src/services/LoggerService';
import { RedditPost } from '../src/types';
import { ReadableStream } from 'stream/web';

// Mock fetch globally
global.fetch = jest.fn();

describe('MediaDownloader', () => {
  let mediaDownloader: MediaDownloader;
  let mockFsService: jest.Mocked<FileSystemService>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockWriteStream: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWriteStream = {
      write: jest.fn(),
      end: jest.fn((cb) => cb && cb()),
      on: jest.fn((event, handler) => {
        if (event === 'finish') {
          setTimeout(() => handler(), 0);
        }
        return mockWriteStream;
      }),
      once: jest.fn(),
      emit: jest.fn(),
      removeListener: jest.fn(),
      writable: true,
      destroyed: false,
    };

    mockFsService = {
      ensureDirectoryExists: jest.fn(),
      fileExists: jest.fn().mockReturnValue(false),
      createWriteStream: jest.fn().mockReturnValue(mockWriteStream),
      writeFile: jest.fn(),
      deleteFile: jest.fn(),
    } as any;

    mockLogger = {
      log: jest.fn(),
      logWelcome: jest.fn(),
      logValidation: jest.fn(),
      logVersionInfo: jest.fn(),
    } as any;

    mediaDownloader = new MediaDownloader(mockFsService, mockLogger);
  });

  describe('Content-Type validation', () => {
    it('should reject HTML responses', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test',
        domain: 'i.redd.it',
        url: 'https://i.redd.it/test.jpg',
        url_overridden_by_dest: 'https://i.redd.it/test.jpg',
        name: 't3_test',
        over_18: false,
        post_hint: 'image',
      } as any;

      // Mock fetch to return HTML content instead of an image
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: jest.fn().mockReturnValue('text/html; charset=utf-8'),
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('<html><body>Not an image</body></html>'));
            controller.close();
          }
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(
        mediaDownloader.download(mockPost, '/downloads/r_pics', 'testbase')
      ).rejects.toThrow('Invalid content type: text/html');

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Received text/html'),
        true
      );
    });

    it('should reject JSON responses', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test',
        domain: 'i.redd.it',
        url: 'https://i.redd.it/test.jpg',
        url_overridden_by_dest: 'https://i.redd.it/test.jpg',
        name: 't3_test',
        over_18: false,
        post_hint: 'image',
      } as any;

      // Mock fetch to return JSON error response
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"error": "not found"}'));
            controller.close();
          }
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(
        mediaDownloader.download(mockPost, '/downloads/r_pics', 'testbase')
      ).rejects.toThrow('Invalid content type: application/json');
    });

    it('should accept valid image content types', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test',
        domain: 'i.redd.it',
        url: 'https://i.redd.it/test.jpg',
        url_overridden_by_dest: 'https://i.redd.it/test.jpg',
        name: 't3_test',
        over_18: false,
        post_hint: 'image',
      } as any;

      // Mock fetch to return valid image content type
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: jest.fn().mockReturnValue('image/jpeg'),
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('fake image data'));
            controller.close();
          }
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await mediaDownloader.download(mockPost, '/downloads/r_pics', 'testbase');

      expect(result).toBe('testbase.jpg');
      expect(mockFsService.createWriteStream).toHaveBeenCalledWith('/downloads/r_pics/testbase.jpg');
    });

    it('should warn on content type mismatch but continue download', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test',
        domain: 'i.redd.it',
        url: 'https://i.redd.it/test.jpg',
        url_overridden_by_dest: 'https://i.redd.it/test.jpg',
        name: 't3_test',
        over_18: false,
        post_hint: 'image',
      } as any;

      // Mock fetch to return PNG when expecting JPG
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: jest.fn().mockReturnValue('image/png'),
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('fake image data'));
            controller.close();
          }
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await mediaDownloader.download(mockPost, '/downloads/r_pics', 'testbase');

      expect(result).toBe('testbase.jpg');
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Content-Type mismatch'),
        true
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Expected: image/jpeg or image/jpg'),
        true
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Received: image/png'),
        true
      );
    });

    it('should accept application/octet-stream as generic binary', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test',
        domain: 'i.redd.it',
        url: 'https://i.redd.it/test.jpg',
        url_overridden_by_dest: 'https://i.redd.it/test.jpg',
        name: 't3_test',
        over_18: false,
        post_hint: 'image',
      } as any;

      // Mock fetch to return octet-stream (generic binary)
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: jest.fn().mockReturnValue('application/octet-stream'),
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('fake image data'));
            controller.close();
          }
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await mediaDownloader.download(mockPost, '/downloads/r_pics', 'testbase');

      expect(result).toBe('testbase.jpg');
      // Should not log warnings for octet-stream
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Content-Type mismatch'),
        true
      );
    });
  });
});
