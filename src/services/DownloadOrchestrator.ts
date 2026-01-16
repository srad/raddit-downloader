import {inject, injectable} from 'tsyringe';
import * as path from 'path';
import {Config, RedditPost, DownloadResult, FileItem} from '../types';
import {StateService} from './StateService';
import {RedditApiService} from './RedditApiService';
import {FileSystemService} from './FileSystemService';
import {DownloadManager} from './download/DownloadManager';
import {getFileName} from '../utils/filenameUtils';
import {extractName, isUserProfile} from '../utils/postUtils';
import {MAX_POSTS_PER_REQUEST} from '../config/constants';
import {CONFIG_TOKEN} from '../config/tokens';

export interface Logger {
    log(message: string, detailed?: boolean): void;
}

export interface DownloadOptions {
    delayBetweenPosts?: number; // Delay in ms between downloading each post
    signal?: AbortSignal; // For cancellation support
}

@injectable()
export class DownloadOrchestrator {
    constructor(
        @inject(CONFIG_TOKEN) private config: Config,
        @inject(StateService) private state: StateService,
        @inject(RedditApiService) private apiService: RedditApiService,
        @inject(FileSystemService) private fsService: FileSystemService,
        @inject(DownloadManager) private downloadManager: DownloadManager
    ) {
    }

    /**
     * Download a single post
     */
    public async downloadPost(
        post: RedditPost,
        logger: Logger,
        options: DownloadOptions = {},
        onNewFolder: (folderName: string, folderPath: string) => void = () => {}
    ): Promise<DownloadResult> {
        const currentTarget = this.state.getCurrentSubreddit();
        const isUser = isUserProfile(currentTarget);
        const isOver18 = post.over_18 || false;
        const targetDir = this.getDownloadDirectory({
            subreddit: post.subreddit,
            isUser,
            isOver18,
            user: post.author,
        });
        const filenameBase = getFileName(post, this.config);

        if (this.fsService.ensureDirectoryExists(targetDir)) {
            // New folder created
            const folderName = path.basename(targetDir);
            const relativePath = folderName; // Folder is at root of downloads
            onNewFolder(folderName, relativePath);
        }
        this.state.downloadDirectory = targetDir;

        // Pass the actual source (user profile or subreddit) to track where we downloaded from
        const source = isUser ? currentTarget : post.subreddit;
        return await this.downloadManager.download(post, targetDir, filenameBase, source);
    }

    public async downloadBatch({
                                   target,
                                   logger,
                                   options = {},
                                   lastPostId = '',
                                   onProgress = () => {},
                                   onDownloadedItem = () => {},
                                   onNewFolder = () => {}
                               }: {
        target: string,
        logger: Logger,
        options: DownloadOptions,
        lastPostId?: string,
        onProgress?: (downloaded: number, total: number, folder: string) => void,
        onDownloadedItem?: (item: FileItem) => void,
        onNewFolder?: (folderName: string, folderPath: string) => void
    }): Promise<void> {
        if (options.signal?.aborted) {
            throw new Error('Aborted');
        }

        const isUser = isUserProfile(target);
        const name = extractName(target);
        const [postsRemaining] = this.state.getPostsRemaining();

        if (postsRemaining <= 0) return;

        // Reddit API has a hard limit of 100 posts per request
        // We need to paginate for larger requests
        const limit = Math.min(postsRemaining, MAX_POSTS_PER_REQUEST);

        logger.log(`Requesting posts from ${name}... (batch size: ${limit}, total remaining: ${postsRemaining})`, true);

        try {
            const data = isUser
                ? await this.apiService.fetchUserPosts(name, limit, lastPostId, options.signal)
                : await this.apiService.fetchSubredditPosts(
                    name,
                    this.state.sorting,
                    this.state.time,
                    limit,
                    lastPostId,
                    options.signal
                );

            if (data.message === 'Not Found' || !data.data || data.data.children.length === 0) {
                throw new Error('Not found or empty');
            }

            this.state.currentAPICall = data;
            this.state.responseSize = data.data.children.length;
            // Check if this is the last batch: either we got fewer posts than requested,
            // or Reddit's 'after' token is null (no more posts available)
            this.state.lastAPICallForSubreddit =
                data.data.children.length < limit || data.data.after === null;

            const posts = data.data.children.map(c => c.data);
            if (posts.length > 0) {
                this.state.downloadedPosts.subreddit = posts[0].subreddit;
            }

            // Download each post in the batch
            let i = 0;
            for (const post of posts) {
                i++;
                if (options.signal?.aborted) {
                    throw new Error('Aborted');
                }

                // Optional delay between posts
                if (options.delayBetweenPosts && options.delayBetweenPosts > 0) {
                    await new Promise(r => setTimeout(r, options.delayBetweenPosts));
                }

                try {
                    const result = await this.downloadPost(post, logger, options, onNewFolder);
                    if (result.downloaded) {
                        this.state.downloadedPosts.media++;
                        if (result.fileItem) {
                            onDownloadedItem(result.fileItem);
                        }
                    } else {
                        this.state.downloadedPosts.skipped_due_to_duplicate++;
                    }
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : String(e);
                    logger.log(`Failed to download post: ${message}`, true);
                    this.state.downloadedPosts.failed++;
                }
                const [remaining, processed] = this.state.getPostsRemaining();
                const folder = path.basename(this.getDownloadDirectory({
                    subreddit: post.subreddit,
                    isUser,
                    isOver18: post.over_18 || false,
                    user: post.author
                }));
                onProgress(processed, this.state.numberOfPosts, folder);
            }

            // Continue with next batch if needed
            const lastChild = posts[posts.length - 1];
            const newLastPostId = lastChild.name;

            if (!this.state.lastAPICallForSubreddit && this.state.getPostsRemaining()[0] > 0) {
                await this.downloadBatch({
                    target,
                    logger,
                    options,
                    lastPostId: newLastPostId,
                    onProgress: onProgress,
                    onDownloadedItem: onDownloadedItem,
                    onNewFolder: onNewFolder
                });
            }
        } catch (err: unknown) {
            if (options.signal?.aborted) {
                throw err; // Propagate abort
            }
            const message = err instanceof Error ? err.message : String(err);
            logger.log(`ERROR: Problem fetching posts for ${name}: ${message}`, true);
            throw err;
        }
    }

    /**
     * Determine the download directory based on config and post metadata
     */
    private getDownloadDirectory({user, isUser, isOver18, subreddit}: {
        subreddit: string,
        isUser: boolean,
        isOver18: boolean,
        user: string
    }): string {
        if (isUser) {
            return `${this.state.downloadDirectoryBase}/u_${user}`;
        }
        return `${this.state.downloadDirectoryBase}/r_${subreddit}`;
    }
}
