import { Downloader } from './Downloader';
import { RedditPost, Config } from '../../types';
import { FileSystemService } from '../FileSystemService';
import { PostType, getPostType } from '../../utils/postUtils';
import { MediaDownloader } from './MediaDownloader';
import { LoggerService } from '../LoggerService';
import { injectable, inject } from 'tsyringe';
import { CONFIG_TOKEN } from '../../config/tokens';

@injectable()
export class GalleryDownloader implements Downloader {
  constructor(
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(MediaDownloader) private mediaDownloader: MediaDownloader,
    @inject(LoggerService) private loggerService: LoggerService,
    @inject(CONFIG_TOKEN) private config: Config,
  ) {}

  canHandle(post: RedditPost): boolean {
    return getPostType(post) === PostType.Gallery;
  }

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<string[]> {
    if (!post.media_metadata || !post.gallery_data) {
      this.loggerService.log(`Gallery post missing metadata: ${post.title}`, true);
      throw new Error('Gallery post missing metadata');
    }

    this.loggerService.log(`Gallery download: ${post.title} (${post.gallery_data.items.length} items)`, true);

    let index = 0;
    const filenames: string[] = [];

    for (const { media_id } of post.gallery_data.items) {
      const media = post.media_metadata[media_id];
      if (!media || !media.s) continue;

      // Prioritize animated formats (mp4 > gif) over static images for better quality
      let downloadUrl: string;
      let postHint: string;

      if (media.s.mp4) {
        // Animated image as MP4 (highest quality for animations)
        downloadUrl = media.s.mp4.replace(/&amp;/g, '&');
        postHint = 'hosted:video';
      } else if (media.s.gif) {
        // Animated image as GIF
        downloadUrl = media.s.gif.replace(/&amp;/g, '&');
        postHint = 'image';
      } else if (media.s.u) {
        // Static image (full resolution)
        downloadUrl = media.s.u.replace(/&amp;/g, '&');
        postHint = 'image';
      } else {
        // No valid source URL found
        this.loggerService.log(`Gallery item ${index + 1}: No valid source URL`, true);
        continue;
      }

      // Construct a fake mini-post to reuse MediaDownloader logic.
      // Clear url_overridden_by_dest, media, and preview so that getMediaDownloadInfo
      // uses the direct downloadUrl without being overridden by the original gallery post's fields.
      const miniPost = {
        ...post,
        url: downloadUrl,
        url_overridden_by_dest: undefined,
        media: undefined,
        preview: undefined,
        post_hint: postHint,
      } as RedditPost;

      // All files go directly into targetDir with pattern: filenameBase_itemIndex
      const itemFilenameBase = `${filenameBase}_${String(index + 1).padStart(2, '0')}`;

      try {
        this.loggerService.log(`Gallery item ${index + 1}/${post.gallery_data.items.length}: ${downloadUrl}`, true);
        const downloadedFilenames = await this.mediaDownloader.download(miniPost, targetDir, itemFilenameBase);
        filenames.push(...downloadedFilenames);

        index++;
      } catch (error: any) {
        this.loggerService.log(`Failed to download gallery item ${index + 1}: ${error.message}`, true);
        this.loggerService.log(`  URL was: ${downloadUrl}`, true);
        // Continue with next item instead of failing entire gallery
      }
    }

    if (filenames.length === 0) {
      throw new Error('Failed to download any gallery items');
    }

    return filenames;
  }
}
