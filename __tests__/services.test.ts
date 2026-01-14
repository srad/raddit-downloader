import 'reflect-metadata';
import { StateService } from '../src/services/StateService';
import { ConfigService } from '../src/services/ConfigService';
import { Config, PromptAnswers } from '../src/types';

// Mock config for testing
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
  use_history_database: true,
  group_gallery_images: false,
};

describe('StateService', () => {
  let stateService: StateService;

  beforeEach(() => {
    stateService = new StateService(mockConfig);
  });

  describe('initFromPrompts', () => {
    it('should initialize state from prompt answers', () => {
      const answers: PromptAnswers = {
        subreddit: 'pics,funny,news',
        numberOfPosts: 50,
        sorting: 'top',
        time: 'week',
        repeatForever: false,
      };

      const result = stateService.initFromPrompts(answers);

      expect(result).toBe(true);
      expect(stateService.subredditList).toEqual(['pics', 'funny', 'news']);
      expect(stateService.numberOfPosts).toBe(50);
      expect(stateService.sorting).toBe('top');
      expect(stateService.time).toBe('week');
      expect(stateService.repeatForever).toBe(false);
    });

    it('should filter out empty strings from subreddit list', () => {
      const answers: PromptAnswers = {
        subreddit: 'pics,,funny,',
        numberOfPosts: 10,
        sorting: 'hot',
        time: 'day',
        repeatForever: false,
      };

      stateService.initFromPrompts(answers);

      expect(stateService.subredditList).toEqual(['pics', 'funny']);
    });

    it('should remove whitespace from subreddit names', () => {
      const answers: PromptAnswers = {
        subreddit: ' pics , funny , news ',
        numberOfPosts: 10,
        sorting: 'hot',
        time: 'day',
        repeatForever: false,
      };

      stateService.initFromPrompts(answers);

      expect(stateService.subredditList).toEqual(['pics', 'funny', 'news']);
    });

    it('should return false if subreddit is missing', () => {
      const answers = {
        subreddit: '',
        numberOfPosts: 10,
        sorting: 'hot',
        time: 'day',
        repeatForever: false,
      } as PromptAnswers;

      const result = stateService.initFromPrompts(answers);

      expect(result).toBe(false);
    });
  });

  describe('getCurrentSubreddit', () => {
    it('should return the current subreddit based on index', () => {
      stateService.subredditList = ['pics', 'funny', 'news'];
      stateService.currentSubredditIndex = 1;

      expect(stateService.getCurrentSubreddit()).toBe('funny');
    });
  });

  describe('nextSubreddit', () => {
    it('should move to next subreddit and return true if available', () => {
      stateService.subredditList = ['pics', 'funny', 'news'];
      stateService.currentSubredditIndex = 0;

      const result = stateService.nextSubreddit();

      expect(result).toBe(true);
      expect(stateService.currentSubredditIndex).toBe(1);
    });

    it('should return false if already at last subreddit', () => {
      stateService.subredditList = ['pics', 'funny', 'news'];
      stateService.currentSubredditIndex = 2;

      const result = stateService.nextSubreddit();

      expect(result).toBe(false);
      expect(stateService.currentSubredditIndex).toBe(2);
    });
  });

  describe('resetSubredditIndex', () => {
    it('should reset index to 0', () => {
      stateService.currentSubredditIndex = 5;
      stateService.resetSubredditIndex();

      expect(stateService.currentSubredditIndex).toBe(0);
    });
  });

  describe('getPostsRemaining', () => {
    it('should calculate posts remaining correctly', () => {
      stateService.numberOfPosts = 100;
      stateService.downloadedPosts = {
        subreddit: 'pics',
        self: 10,
        media: 20,
        link: 5,
        failed: 3,
        skipped_due_to_duplicate: 7,
        skipped_due_to_fileType: 5,
      };

      const [remaining, total] = stateService.getPostsRemaining();

      expect(remaining).toBe(50); // 100 - 50
      expect(total).toBe(50); // 10 + 20 + 5 + 3 + 7 + 5
    });
  });

  describe('createEmptyDownloadStats', () => {
    it('should create empty download stats', () => {
      const stats = stateService.createEmptyDownloadStats();

      expect(stats).toEqual({
        subreddit: '',
        self: 0,
        media: 0,
        link: 0,
        failed: 0,
        skipped_due_to_duplicate: 0,
        skipped_due_to_fileType: 0,
      });
    });
  });
});

describe('ConfigService', () => {
  describe('validate', () => {
    it('should validate a valid config', () => {
      const result = ConfigService.validate(mockConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidConfig = {
        ...mockConfig,
        file_naming_scheme: undefined,
      } as any;

      const result = ConfigService.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect if no post types are enabled', () => {
      const invalidConfig = {
        ...mockConfig,
        download_gallery_posts: false,
        download_self_posts: false,
        download_media_posts: false,
        download_link_posts: false,
      };

      const result = ConfigService.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No post types are enabled for download');
    });
  });
});
