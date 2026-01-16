import 'reflect-metadata';
import { DownloadOrchestrator, Logger } from '../src/services/DownloadOrchestrator';
import { StateService } from '../src/services/StateService';
import { RedditApiService } from '../src/services/RedditApiService';
import { FileSystemService } from '../src/services/FileSystemService';
import { DownloadManager } from '../src/services/download/DownloadManager';
import { Config, RedditPost, RedditApiResponse } from '../src/types';

// Mock implementations
const mockConfig: Config = {
  file_naming_scheme: {
    showDate: true,
    showScore: false,
    showSubreddit: true,
    showAuthor: true,
    showTitle: true,
  },
  download_post_list_options: {
    enabled: false,
    repeatForever: false,
    timeBetweenRuns: 0,
  },
  detailed_logs: false,
  local_logs: false,
  local_logs_naming_scheme: {
    showDateAndTime: true,
    showSubreddits: true,
    showNumberOfPosts: true,
  },
  separate_clean_nsfw: false,
  redownload_posts: false,
  download_gallery_posts: true,
  download_self_posts: true,
  download_media_posts: true,
  download_link_posts: true,
  download_comments: false,
  download_youtube_videos_experimental: false,
  use_history_database: false,
  group_gallery_images: false,
};

const mockPost: RedditPost = {
  created: 1234567890,
  score: 100,
  subreddit: 'pics',
  author: 'testuser',
  title: 'Test Post',
  domain: 'imgur.com',
  url: 'https://i.imgur.com/test.jpg',
  name: 't3_abc123',
  over_18: false,
};

const mockApiResponse: RedditApiResponse = {
  kind: 'Listing',
  data: {
    after: null,
    before: null,
    children: [
      {
        kind: 't3',
        data: mockPost,
      },
    ],
    dist: 1,
  },
};

describe('DownloadOrchestrator', () => {
  let orchestrator: DownloadOrchestrator;
  let mockState: jest.Mocked<StateService>;
  let mockApiService: jest.Mocked<RedditApiService>;
  let mockFsService: jest.Mocked<FileSystemService>;
  let mockDownloadManager: jest.Mocked<DownloadManager>;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create mocks
    mockState = {
      subredditList: ['pics'],
      numberOfPosts: 10,
      sorting: 'top',
      time: 'all',
      currentSubredditIndex: 0,
      downloadDirectoryBase: '/downloads',
      downloadedPosts: {
        subreddit: '',
        self: 0,
        media: 0,
        link: 0,
        failed: 0,
        skipped_due_to_duplicate: 0,
        skipped_due_to_fileType: 0,
      },
      getCurrentSubreddit: jest.fn().mockReturnValue('pics'),
      getPostsRemaining: jest.fn().mockReturnValue([10, 0]),
    } as any;

    mockApiService = {
      fetchSubredditPosts: jest.fn().mockResolvedValue(mockApiResponse),
      fetchUserPosts: jest.fn().mockResolvedValue(mockApiResponse),
    } as any;

    mockFsService = {
      ensureDirectoryExists: jest.fn(),
      fileExists: jest.fn().mockReturnValue(false),
    } as any;

    mockDownloadManager = {
      download: jest.fn().mockResolvedValue(true),
    } as any;

    mockLogger = {
      log: jest.fn(),
    };

    orchestrator = new DownloadOrchestrator(
      mockConfig,
      mockState,
      mockApiService,
      mockFsService,
      mockDownloadManager
    );
  });

  describe('downloadPost', () => {
    it('should download a post to the correct directory', async () => {
      await orchestrator.downloadPost(mockPost, mockLogger);

      expect(mockFsService.ensureDirectoryExists).toHaveBeenCalledWith(
        '/downloads/r_pics'
      );
      // mockPost.created = 1234567890 => 2009-02-13 23:31:30 UTC
      expect(mockDownloadManager.download).toHaveBeenCalledWith(
        mockPost,
        '/downloads/r_pics',
        expect.stringMatching(/^pics_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/),
        'pics' // Source parameter (subreddit name)
      );
    });

    it('should handle NSFW separation when configured', async () => {
      const nsfwConfig = { ...mockConfig, separate_clean_nsfw: true };
      const nsfwPost = { ...mockPost, over_18: true };
      const nsfwOrchestrator = new DownloadOrchestrator(
        nsfwConfig,
        mockState,
        mockApiService,
        mockFsService,
        mockDownloadManager
      );

      await nsfwOrchestrator.downloadPost(nsfwPost, mockLogger);

      expect(mockFsService.ensureDirectoryExists).toHaveBeenCalledWith(
        '/downloads/r_pics'
      );
    });

    it('should handle user profile downloads', async () => {
      mockState.getCurrentSubreddit.mockReturnValue('user/testuser');

      await orchestrator.downloadPost(mockPost, mockLogger);

      expect(mockFsService.ensureDirectoryExists).toHaveBeenCalledWith(
        '/downloads/u_testuser'
      );
    });
  });

  describe('downloadBatch', () => {
    it('should fetch and download posts from a subreddit', async () => {
      mockState.getPostsRemaining.mockReturnValue([10, 0]);

      await orchestrator.downloadBatch({ target: 'pics', logger: mockLogger, options: {} });

      expect(mockApiService.fetchSubredditPosts).toHaveBeenCalledWith(
        'pics',
        'top',
        'all',
        10,
        '',
        undefined
      );
      expect(mockDownloadManager.download).toHaveBeenCalledTimes(1);
      expect(mockState.downloadedPosts.media).toBe(1);
    });

    it('should respect post limit', async () => {
      mockState.getPostsRemaining.mockReturnValue([5, 5]);

      await orchestrator.downloadBatch({ target: 'pics', logger: mockLogger, options: {} });

      expect(mockApiService.fetchSubredditPosts).toHaveBeenCalledWith(
        'pics',
        'top',
        'all',
        5,
        '',
        undefined
      );
    });

    it('should handle download failures gracefully', async () => {
      mockDownloadManager.download.mockRejectedValueOnce(
        new Error('Download failed')
      );

      await orchestrator.downloadBatch({ target: 'pics', logger: mockLogger, options: {} });

      expect(mockState.downloadedPosts.failed).toBe(1);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to download post'),
        true
      );
    });

    it('should handle abort signals', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        orchestrator.downloadBatch({
          target: 'pics',
          logger: mockLogger,
          options: { signal: abortController.signal },
        })
      ).rejects.toThrow('Aborted');
    });

    it.skip('should apply delay between posts when configured', async () => {
      // Skipped: Testing timers with async promises is complex
      // This functionality is tested implicitly in integration tests
    });

    it('should fetch from user endpoint for user profiles', async () => {
      mockState.getPostsRemaining.mockReturnValue([10, 0]);

      await orchestrator.downloadBatch({ target: 'user/testuser', logger: mockLogger, options: {} });

      expect(mockApiService.fetchUserPosts).toHaveBeenCalledWith(
        'testuser',
        10,
        '',
        undefined
      );
    });
  });
});
