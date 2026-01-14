/**
 * Unit tests for utility functions
 */

import {
	sanitizeFileName,
	getFileName,
} from '../src/utils/filenameUtils';

import {
	getPostType,
	getPostTypeName,
	getMediaDownloadInfo,
	isUserProfile,
	extractName,
	PostType,
} from '../src/utils/postUtils';

import {
	Config,
	RedditPost,
} from '../src/types';

import { ConfigService } from '../src/services/ConfigService';
import { MAX_FILENAME_LENGTH } from '../src/config/constants';

describe('sanitizeFileName', () => {
	test('removes forward slashes', () => {
		expect(sanitizeFileName('hello/world')).toBe('hello-world');
	});

	test('removes backslashes', () => {
		expect(sanitizeFileName('hello\\world')).toBe('hello-world');
	});

	test('removes question marks', () => {
		expect(sanitizeFileName('what?')).toBe('what-');
	});

	test('removes colons', () => {
		expect(sanitizeFileName('time: 12:00')).toBe('time- 12-00');
	});

	test('removes asterisks', () => {
		expect(sanitizeFileName('star*power')).toBe('star-power');
	});

	test('removes angle brackets', () => {
		expect(sanitizeFileName('<html>')).toBe('-html-');
	});

	test('removes pipe characters', () => {
		expect(sanitizeFileName('foo|bar')).toBe('foo-bar');
	});

	test('removes percent signs', () => {
		expect(sanitizeFileName('100%')).toBe('100-');
	});

	test('handles multiple invalid characters', () => {
		expect(sanitizeFileName('test?file:name*here')).toBe('test-file-name-here');
	});

	test('preserves valid characters', () => {
		expect(sanitizeFileName('valid-file_name.txt')).toBe('valid-file_name.txt');
	});
});

describe('getFileName', () => {
	const baseConfig: Config = {
		file_naming_scheme: {
			showDate: true,
			showScore: true,
			showSubreddit: true,
			showAuthor: true,
			showTitle: true,
		},
        download_post_list_options: { enabled: false, repeatForever: false, timeBetweenRuns: 0 },
        local_logs_naming_scheme: { showDateAndTime: false, showSubreddits: false, showNumberOfPosts: false }
	};

	const mockPost = {
		created: 1609545600,
		score: 1234,
		subreddit: 'pics',
		author: 'testuser',
		title: 'Test Post Title',
	} as unknown as RedditPost;

	test('generates simple filename: subreddit_YYYY-MM-DD_HH-MM-SS', () => {
		const result = getFileName(mockPost, baseConfig);
		// mockPost.created = 1609545600 => 2021-01-02 00:00:00 UTC
		expect(result).toMatch(/^pics_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
		expect(result).toContain('pics');
		expect(result).toContain('2021-01-02');
	});

	test('config options are ignored (simple format)', () => {
		const config: Config = { ...baseConfig, file_naming_scheme: { ...baseConfig.file_naming_scheme, showDate: false } };
		const result = getFileName(mockPost, config);
		// Simple format doesn't use config, should still be subreddit_timestamp
		expect(result).toMatch(/^pics_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
	});

	test('always generates short clean filenames', () => {
		// Even with very long title, filename stays simple
		const longTitlePost = {
			...mockPost,
			title: 'A'.repeat(300),
		} as unknown as RedditPost;
		const result = getFileName(longTitlePost, baseConfig);
		expect(result).toMatch(/^pics_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
		expect(result.length).toBeLessThan(50); // Much shorter than MAX_FILENAME_LENGTH
	});

	test('no special characters or ellipsis needed', () => {
		const postWithSpecialChars = {
			...mockPost,
			title: 'What? A <test> file! With&lt;HTML&gt;',
		} as unknown as RedditPost;
		const result = getFileName(postWithSpecialChars, baseConfig);
		// Simple format ignores title completely
		expect(result).toMatch(/^pics_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
		expect(result).not.toContain('?');
		expect(result).not.toContain('<');
		expect(result).not.toContain('&');
		expect(result).not.toMatch(/\.\.\./);
	});
});

describe('getPostType', () => {
	test('returns Self for self posts (is_self)', () => {
		const post = { is_self: true, domain: 'self.test' } as RedditPost;
		expect(getPostType(post)).toBe(PostType.Self);
	});

	test('returns Self for self posts (post_hint)', () => {
		const post = { post_hint: 'self', domain: 'self.test' } as RedditPost;
		expect(getPostType(post)).toBe(PostType.Self);
	});

	test('returns Media for image posts', () => {
		const post = { post_hint: 'image', domain: 'i.imgur.com' } as RedditPost;
		expect(getPostType(post)).toBe(PostType.Media);
	});

	test('returns Media for hosted video posts', () => {
		const post = { post_hint: 'hosted:video', domain: 'v.redd.it' } as RedditPost;
		expect(getPostType(post)).toBe(PostType.Media);
	});

	test('returns Media for i.redd.it posts', () => {
		const post = { domain: 'i.redd.it', post_hint: 'link' } as RedditPost;
		expect(getPostType(post)).toBe(PostType.Media);
	});

	test('returns Media for imgur link posts (not gallery)', () => {
		const post = {
			post_hint: 'link',
			domain: 'imgur.com',
			url_overridden_by_dest: 'https://imgur.com/abc123',
		} as RedditPost;
		expect(getPostType(post)).toBe(PostType.Media);
	});

	test('returns Link for YouTube links (not media)', () => {
		const post = {
			post_hint: 'rich:video',
			domain: 'youtube.com',
		} as RedditPost;
		expect(getPostType(post)).toBe(PostType.Link);
	});

	test('returns Poll for poll posts', () => {
		const post = { poll_data: { options: [] }, domain: 'reddit.com' } as RedditPost;
		expect(getPostType(post)).toBe(PostType.Poll);
	});

	test('returns Gallery for gallery posts', () => {
		const post = { is_gallery: true, domain: 'reddit.com' } as RedditPost;
		expect(getPostType(post)).toBe(PostType.Gallery);
	});

	test('returns Link for regular link posts', () => {
		const post = { post_hint: 'link', domain: 'example.com' } as RedditPost;
		expect(getPostType(post)).toBe(PostType.Link);
	});
});

describe('getPostTypeName', () => {
	test('returns correct names for each type', () => {
		expect(getPostTypeName(PostType.Self)).toBe('self');
		expect(getPostTypeName(PostType.Media)).toBe('media');
		expect(getPostTypeName(PostType.Link)).toBe('link');
		expect(getPostTypeName(PostType.Poll)).toBe('poll');
		expect(getPostTypeName(PostType.Gallery)).toBe('gallery');
	});
});

describe('getMediaDownloadInfo', () => {
	test('extracts file type from URL', () => {
		const post = { url: 'https://example.com/image.jpg' } as RedditPost;
		const result = getMediaDownloadInfo(post);
		expect(result.fileType).toBe('jpg');
		expect(result.downloadURL).toBe(post.url);
	});
});

describe('ConfigService.parsePostListContent', () => {
	test('parses valid Reddit URLs', () => {
		const content = `
https://www.reddit.com/r/pics/comments/abc123/test_post/
https://www.reddit.com/r/news/comments/def456/another_post/
		`;
		const result = ConfigService.parsePostListContent(content);
		expect(result).toHaveLength(2);
		expect(result[0]).toContain('abc123');
		expect(result[1]).toContain('def456');
	});

	test('ignores comment lines', () => {
		const content = `
# This is a comment
https://www.reddit.com/r/pics/comments/abc123/test/
# Another comment
		`;
		const result = ConfigService.parsePostListContent(content);
		expect(result).toHaveLength(1);
	});
});

describe('isUserProfile', () => {
	test('returns true for u/ prefix', () => {
		expect(isUserProfile('u/username')).toBe(true);
	});

	test('returns true for user/ prefix', () => {
		expect(isUserProfile('user/username')).toBe(true);
	});

	test('returns true for /u/ prefix', () => {
		expect(isUserProfile('/u/username')).toBe(true);
	});

	test('returns false for subreddit names', () => {
		expect(isUserProfile('pics')).toBe(false);
		expect(isUserProfile('AskReddit')).toBe(false);
	});
});

describe('extractName', () => {
	test('extracts username from u/ prefix', () => {
		expect(extractName('u/testuser')).toBe('testuser');
	});

	test('extracts username from user/ prefix', () => {
		expect(extractName('user/testuser')).toBe('testuser');
	});

	test('returns subreddit name as-is', () => {
		expect(extractName('pics')).toBe('pics');
		expect(extractName('AskReddit')).toBe('AskReddit');
	});
});
