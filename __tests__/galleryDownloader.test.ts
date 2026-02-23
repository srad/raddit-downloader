import 'reflect-metadata';
import { GalleryDownloader } from '../src/services/download/GalleryDownloader';
import { MediaDownloader } from '../src/services/download/MediaDownloader';
import { FileSystemService } from '../src/services/FileSystemService';
import { LoggerService } from '../src/services/LoggerService';
import { RedditPost, Config } from '../src/types';

describe('GalleryDownloader', () => {
  let galleryDownloader: GalleryDownloader;
  let mockFsService: jest.Mocked<FileSystemService>;
  let mockMediaDownloader: jest.Mocked<MediaDownloader>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockConfig: Config;

  beforeEach(() => {
    mockFsService = {
      ensureDirectoryExists: jest.fn(),
      fileExists: jest.fn(),
      createWriteStream: jest.fn(),
      writeFile: jest.fn(),
      deleteFile: jest.fn(),
    } as any;

    mockMediaDownloader = {
      download: jest.fn().mockResolvedValue(['file_01.jpg']),
      canHandle: jest.fn(),
    } as any;

    mockLogger = {
      log: jest.fn(),
      logWelcome: jest.fn(),
      logValidation: jest.fn(),
      logVersionInfo: jest.fn(),
    } as any;

    mockConfig = {} as Config;

    galleryDownloader = new GalleryDownloader(mockFsService, mockMediaDownloader, mockLogger, mockConfig);
  });

  describe('download', () => {
    it('should download all gallery items to flat directory structure', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test Gallery',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/abc',
        name: 't3_abc123',
        over_18: false,
        gallery_data: {
          items: [
            { media_id: 'id1', id: 1 },
            { media_id: 'id2', id: 2 },
            { media_id: 'id3', id: 3 },
          ],
        },
        media_metadata: {
          id1: { s: { u: 'https://i.redd.it/image1.jpg' } },
          id2: { s: { u: 'https://i.redd.it/image2.jpg' } },
          id3: { s: { u: 'https://i.redd.it/image3.jpg' } },
        },
      } as any;

      mockMediaDownloader.download
        .mockResolvedValueOnce(['testbase_01.jpg'])
        .mockResolvedValueOnce(['testbase_02.jpg'])
        .mockResolvedValueOnce(['testbase_03.jpg']);

      const result = await galleryDownloader.download(mockPost, '/downloads/r_pics', 'testbase');

      // Should return first filename
      expect(result).toEqual(['testbase_01.jpg', 'testbase_02.jpg', 'testbase_03.jpg']);

      // Should call MediaDownloader 3 times, once for each item
      expect(mockMediaDownloader.download).toHaveBeenCalledTimes(3);

      // All items should be downloaded to the same directory (no subfolders)
      expect(mockMediaDownloader.download).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://i.redd.it/image1.jpg' }),
        '/downloads/r_pics',
        'testbase_01',
      );
      expect(mockMediaDownloader.download).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://i.redd.it/image2.jpg' }),
        '/downloads/r_pics',
        'testbase_02',
      );
      expect(mockMediaDownloader.download).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://i.redd.it/image3.jpg' }),
        '/downloads/r_pics',
        'testbase_03',
      );

      // Should NOT create any subfolders
      expect(mockFsService.ensureDirectoryExists).not.toHaveBeenCalled();
    });

    it('should handle animated gallery items (mp4)', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'gifs',
        author: 'testuser',
        title: 'Animated Gallery',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/xyz',
        name: 't3_xyz789',
        over_18: false,
        gallery_data: {
          items: [{ media_id: 'id1', id: 1 }],
        },
        media_metadata: {
          id1: { s: { mp4: 'https://i.redd.it/animated.mp4' } },
        },
      } as any;

      mockMediaDownloader.download.mockResolvedValueOnce(['testbase_01.mp4']);

      await galleryDownloader.download(mockPost, '/downloads/r_gifs', 'testbase');

      expect(mockMediaDownloader.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://i.redd.it/animated.mp4',
          post_hint: 'hosted:video',
        }),
        '/downloads/r_gifs',
        'testbase_01',
      );
    });

    it('should handle gif format gallery items', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'gifs',
        author: 'testuser',
        title: 'GIF Gallery',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/gif',
        name: 't3_gif123',
        over_18: false,
        gallery_data: {
          items: [{ media_id: 'id1', id: 1 }],
        },
        media_metadata: {
          id1: { s: { gif: 'https://i.redd.it/animated.gif' } },
        },
      } as any;

      mockMediaDownloader.download.mockResolvedValueOnce(['testbase_01.gif']);

      await galleryDownloader.download(mockPost, '/downloads/r_gifs', 'testbase');

      expect(mockMediaDownloader.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://i.redd.it/animated.gif',
          post_hint: 'image',
        }),
        '/downloads/r_gifs',
        'testbase_01',
      );
    });

    it('should decode HTML entities in URLs', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/test',
        name: 't3_test',
        over_18: false,
        gallery_data: {
          items: [{ media_id: 'id1', id: 1 }],
        },
        media_metadata: {
          id1: { s: { u: 'https://i.redd.it/image.jpg?param=1&amp;param2=2' } },
        },
      } as any;

      mockMediaDownloader.download.mockResolvedValueOnce(['testbase_01.jpg']);

      await galleryDownloader.download(mockPost, '/downloads/r_pics', 'testbase');

      expect(mockMediaDownloader.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://i.redd.it/image.jpg?param=1&param2=2', // &amp; should be decoded to &
        }),
        '/downloads/r_pics',
        'testbase_01',
      );
    });

    it('should continue downloading other items if one fails', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test Gallery',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/abc',
        name: 't3_abc123',
        over_18: false,
        gallery_data: {
          items: [
            { media_id: 'id1', id: 1 },
            { media_id: 'id2', id: 2 },
            { media_id: 'id3', id: 3 },
          ],
        },
        media_metadata: {
          id1: { s: { u: 'https://i.redd.it/image1.jpg' } },
          id2: { s: { u: 'https://i.redd.it/image2.jpg' } },
          id3: { s: { u: 'https://i.redd.it/image3.jpg' } },
        },
      } as any;

      mockMediaDownloader.download
        .mockResolvedValueOnce(['testbase_01.jpg'])
        .mockRejectedValueOnce(new Error('Unable to determine file type'))
        .mockResolvedValueOnce(['testbase_03.jpg']);

      const result = await galleryDownloader.download(mockPost, '/downloads/r_pics', 'testbase');

      expect(result).toEqual(['testbase_01.jpg', 'testbase_03.jpg']);
      expect(mockMediaDownloader.download).toHaveBeenCalledTimes(3);
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Failed to download gallery item'), true);
    });

    it('should throw error if all gallery items fail', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test Gallery',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/abc',
        name: 't3_abc123',
        over_18: false,
        gallery_data: {
          items: [{ media_id: 'id1', id: 1 }],
        },
        media_metadata: {
          id1: { s: { u: 'https://i.redd.it/bad-url' } },
        },
      } as any;

      mockMediaDownloader.download.mockRejectedValue(new Error('Unable to determine file type'));

      await expect(galleryDownloader.download(mockPost, '/downloads/r_pics', 'testbase')).rejects.toThrow(
        'Failed to download any gallery items',
      );
    });

    it('should throw error if gallery metadata is missing', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test Gallery',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/abc',
        name: 't3_abc123',
        over_18: false,
      } as any;

      await expect(galleryDownloader.download(mockPost, '/downloads/r_pics', 'testbase')).rejects.toThrow(
        'Gallery post missing metadata',
      );
    });

    it('should skip gallery items with no valid source URL', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test Gallery',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/abc',
        name: 't3_abc123',
        over_18: false,
        gallery_data: {
          items: [
            { media_id: 'id1', id: 1 },
            { media_id: 'id2', id: 2 },
          ],
        },
        media_metadata: {
          id1: { s: {} }, // No valid source
          id2: { s: { u: 'https://i.redd.it/image2.jpg' } },
        },
      } as any;

      mockMediaDownloader.download.mockResolvedValueOnce(['testbase_01.jpg']);

      const result = await galleryDownloader.download(mockPost, '/downloads/r_pics', 'testbase');

      expect(result).toEqual(['testbase_01.jpg']);
      expect(mockMediaDownloader.download).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('No valid source URL'), true);
    });

    it('should use zero-padded index in filenames', async () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test Gallery',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/abc',
        name: 't3_abc123',
        over_18: false,
        gallery_data: {
          items: Array.from({ length: 12 }, (_, i) => ({ media_id: `id${i}`, id: i })),
        },
        media_metadata: Object.fromEntries(
          Array.from({ length: 12 }, (_, i) => [`id${i}`, { s: { u: `https://i.redd.it/image${i}.jpg` } }]),
        ),
      } as any;

      mockMediaDownloader.download.mockResolvedValue(['file.jpg']);

      await galleryDownloader.download(mockPost, '/downloads/r_pics', 'testbase');

      // Check that single-digit indexes are zero-padded
      expect(mockMediaDownloader.download).toHaveBeenCalledWith(expect.anything(), '/downloads/r_pics', 'testbase_01');
      expect(mockMediaDownloader.download).toHaveBeenCalledWith(expect.anything(), '/downloads/r_pics', 'testbase_09');
      expect(mockMediaDownloader.download).toHaveBeenCalledWith(expect.anything(), '/downloads/r_pics', 'testbase_10');
    });
  });

  describe('canHandle', () => {
    it('should return true for gallery posts', () => {
      const mockPost: RedditPost = {
        created: 1234567890,
        score: 100,
        subreddit: 'pics',
        author: 'testuser',
        title: 'Test',
        domain: 'reddit.com',
        url: 'https://reddit.com/gallery/abc',
        name: 't3_abc',
        over_18: false,
        is_gallery: true,
      } as any;

      expect(galleryDownloader.canHandle(mockPost)).toBe(true);
    });
  });
});
