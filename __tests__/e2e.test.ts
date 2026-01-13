/**
 * End-to-end tests for Reddit Post Downloader
 * These tests actually download content from Reddit to verify functionality
 *
 * NOTE: These tests make real network requests and may take some time.
 * Run with: npm test -- --testPathPattern=e2e
 */

import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import {
	getPostType,
	getPostTypeName,
	getMediaDownloadInfo,
    PostType,
} from '../src/utils/postUtils';
import { getFileName } from '../src/utils/filenameUtils';
import { RedditApiService } from '../src/services/RedditApiService';
import { Config, RedditPost } from '../src/types';
import { DEFAULT_REQUEST_TIMEOUT } from '../src/config/constants';

const TEST_DOWNLOAD_DIR = path.join(__dirname, '../downloads_test');
const TEST_CONFIG: Config = {
	file_naming_scheme: {
		showDate: true,
		showScore: true,
		showSubreddit: true,
		showAuthor: true,
		showTitle: true,
	},
    download_post_list_options: { enabled: false, repeatForever: false, timeBetweenRuns: 0 },
    local_logs_naming_scheme: { showDateAndTime: false, showSubreddits: false, showNumberOfPosts: false },
    group_gallery_images: false,
};

jest.setTimeout(60000);

const apiService = new RedditApiService();

async function fetchRedditPosts(subreddit: string, limit: number = 5, sorting: string = 'top', time: string = 'month'): Promise<RedditPost[]> {
  const data = await apiService.fetchSubredditPosts(subreddit, sorting, time, limit);
  return data.data.children.map((child: any) => child.data);
}

async function downloadFile(url: string, destPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error('Download failed');
    
    const fileStream = fs.createWriteStream(destPath);
    // @ts-ignore
    await pipeline(Readable.fromWeb(response.body), fileStream);
}

beforeAll(() => {
	if (!fs.existsSync(TEST_DOWNLOAD_DIR)) {
		fs.mkdirSync(TEST_DOWNLOAD_DIR, { recursive: true });
	}
});

afterAll(() => {
	if (fs.existsSync(TEST_DOWNLOAD_DIR)) {
		fs.rmSync(TEST_DOWNLOAD_DIR, { recursive: true, force: true });
	}
});

describe('Reddit API Integration', () => {
	test('can fetch posts from r/pics subreddit', async () => {
		const posts = await fetchRedditPosts('pics', 3);

		expect(posts.length).toBeGreaterThan(0);
		expect(posts[0]).toHaveProperty('title');
		expect(posts[0]).toHaveProperty('author');
		expect(posts[0]).toHaveProperty('subreddit');
		expect(posts[0].subreddit.toLowerCase()).toBe('pics');
	});

	test('can fetch posts from r/news subreddit', async () => {
		const posts = await fetchRedditPosts('news', 3);

		expect(posts.length).toBeGreaterThan(0);
		expect(posts[0]).toHaveProperty('title');
		expect(posts[0].subreddit.toLowerCase()).toBe('news');
	});

	test('can fetch posts with different sorting options', async () => {
		const topPosts = await fetchRedditPosts('pics', 2, 'top', 'all');
		const newPosts = await fetchRedditPosts('pics', 2, 'new', 'all');

		expect(topPosts.length).toBeGreaterThan(0);
		expect(newPosts.length).toBeGreaterThan(0);

		expect(topPosts[0].score).toBeGreaterThan(0);
	});

    // Native fetch throws TypeError on network errors, or we can check behavior
	test('handles non-existent subreddit gracefully', async () => {
        // Our service might resolve with error json or throw.
        // fetchSubredditPosts returns JSON. Reddit returns 404 or empty structure?
        // RedditApiService throws if !response.ok
		await expect(
			fetchRedditPosts('thisdoesnotexist123456789xyz', 1),
		).rejects.toThrow();
	});
});

describe('Post Type Detection (Real Posts)', () => {
	test('correctly identifies image posts from r/pics', async () => {
		const posts = await fetchRedditPosts('pics', 10, 'top', 'month');

		const imagePost = posts.find((post) => {
			const type = getPostType(post);
			return type === PostType.Media; 
		});

		if (imagePost) {
			expect(getPostType(imagePost)).toBe(PostType.Media);
			expect(getPostTypeName(getPostType(imagePost))).toBe('media');
		}
	});

	test('correctly identifies self/text posts from r/AskReddit', async () => {
		const posts = await fetchRedditPosts('AskReddit', 5, 'top', 'week');

		const selfPost = posts.find((post) => getPostType(post) === PostType.Self);

		if (selfPost) {
			expect(getPostType(selfPost)).toBe(PostType.Self);
			expect(selfPost.is_self).toBe(true);
		}
	});

	test('correctly identifies link posts from r/technology', async () => {
		const posts = await fetchRedditPosts('technology', 10, 'top', 'week');

		const linkPost = posts.find((post) => getPostType(post) === PostType.Link);

		if (linkPost) {
			expect(getPostType(linkPost)).toBe(PostType.Link);
			expect(linkPost.is_self).toBeFalsy();
		}
	});
});

describe('File Naming (Real Posts)', () => {
	test('generates valid filenames for real posts', async () => {
		const posts = await fetchRedditPosts('pics', 3);

		for (const post of posts) {
			const fileName = getFileName(post, TEST_CONFIG);

			expect(fileName).not.toMatch(/[/\\?%*:|"<>]/);

			expect(fileName).toContain(post.subreddit);
			expect(fileName).toContain(post.author);

			expect(fileName.length).toBeLessThanOrEqual(240);
		}
	});
});

describe('Media Download Info (Real Posts)', () => {
	test('extracts download info from image posts', async () => {
		const posts = await fetchRedditPosts('pics', 10);

		const imagePost = posts.find(
			(post) => getPostType(post) === PostType.Media && post.url,
		);

		if (imagePost) {
			const info = getMediaDownloadInfo(imagePost);

			expect(info).toHaveProperty('downloadURL');
			expect(info).toHaveProperty('fileType');
			expect(info.downloadURL).toMatch(/^https?:\/\//);
		}
	});
});

describe('Actual File Downloads', () => {
	test('can download an image from Reddit', async () => {
		const posts = await fetchRedditPosts('pics', 20, 'top', 'month');

		const imagePost = posts.find(
			(post) =>
				post.url &&
				(post.url.endsWith('.jpg') ||
					post.url.endsWith('.png') ||
					post.url.endsWith('.jpeg'))
		);

		if (imagePost) {
			const fileName = `test_image.${imagePost.url.split('.').pop()}`;
			const filePath = path.join(TEST_DOWNLOAD_DIR, fileName);

			await downloadFile(imagePost.url, filePath);

			expect(fs.existsSync(filePath)).toBe(true);

			const stats = fs.statSync(filePath);
			expect(stats.size).toBeGreaterThan(0);

			console.log(`Downloaded image: ${fileName} (${stats.size} bytes)`);
		} else {
			console.log('No direct image link found, skipping download test');
		}
	});
});

describe('User Profile Downloads', () => {
	test('can fetch posts from a user profile', async () => {
        const data = await apiService.fetchUserPosts('reddit', 5);
		const posts = data.data.children.map((child: any) => child.data);

		expect(posts.length).toBeGreaterThan(0);
		expect(posts[0]).toHaveProperty('author');
	});
});

describe('Gallery Post Detection', () => {
	test('can identify gallery posts', async () => {
		const posts = await fetchRedditPosts('itookapicture', 20, 'top', 'month');

		const galleryPost = posts.find((post) => post.is_gallery === true);

		if (galleryPost) {
			expect(getPostType(galleryPost)).toBe(PostType.Gallery);
			expect(galleryPost).toHaveProperty('media_metadata');
		} else {
			console.log('No gallery post found in sample');
		}
	});
});

describe('Error Handling', () => {
	test('handles 404 errors gracefully', async () => {
        // The service throws on 404
		await expect(
            apiService.fetchSubredditPosts('thisdefinitelydoesnotexist12345', 'top', 'all', 5)
		).rejects.toThrow();
	});
});

describe('Rate Limiting Awareness', () => {
	test('can make multiple requests without being rate limited', async () => {
		const subreddits = ['pics', 'news', 'technology'];
		const results = [];

		for (const subreddit of subreddits) {
			const posts = await fetchRedditPosts(subreddit, 2);
			results.push({
				subreddit,
				count: posts.length,
			});

			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		expect(results.length).toBe(3);
		results.forEach((result) => {
			expect(result.count).toBeGreaterThan(0);
		});
	});
});
