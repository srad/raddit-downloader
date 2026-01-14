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

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<void> {
    if (!post.media_metadata || !post.gallery_data) {
      this.loggerService.log(`Gallery post missing metadata: ${post.title}`, true);
      return;
    }

    const shouldGroup = this.config.group_gallery_images === true;
    let postDirectory = targetDir;

    if (shouldGroup) {
      postDirectory = `${targetDir}/${filenameBase}`;
      this.fsService.ensureDirectoryExists(postDirectory);
    }

    // Index tracking for potential ordering if needed, currently ID based
    let index = 0;

    for (const { media_id, id } of post.gallery_data.items) {
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
        continue;
      }

      // Construct a fake mini-post to reuse MediaDownloader logic
      const miniPost = {
        ...post,
        url: downloadUrl,
        post_hint: postHint,
      } as RedditPost;

      let itemFilenameBase: string;
      if (shouldGroup) {
        // Inside folder: just the ID or Index
        itemFilenameBase = id.toString();
      } else {
        // Flat list: PostTitle_ID
        // Adding index to ensure order or just ID? ID is unique but random looking.
        // Let's use ID to be safe, maybe formatted as `${filenameBase}_${index}_${id}` if order matters?
        // Or just `${filenameBase}_${id}`.
        itemFilenameBase = `${filenameBase}_${id}`;
      }

      await this.mediaDownloader.download(miniPost, postDirectory, itemFilenameBase);
      index++;
    }
  }
}
