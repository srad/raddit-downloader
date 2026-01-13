import { Downloader } from './Downloader';
import { RedditPost } from '../../types';
import { FileSystemService } from '../FileSystemService';
import { PostType, getPostType } from '../../utils/postUtils';
import { MediaDownloader } from './MediaDownloader';
import { LoggerService } from '../LoggerService';
import { injectable, inject } from 'tsyringe';

@injectable()
export class GalleryDownloader implements Downloader {
  constructor(
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(MediaDownloader) private mediaDownloader: MediaDownloader,
    @inject(LoggerService) private loggerService: LoggerService,
  ) {}

  canHandle(post: RedditPost): boolean {
    return getPostType(post) === PostType.Gallery;
  }

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<void> {
    if (!post.media_metadata || !post.gallery_data) {
      this.loggerService.log(`Gallery post missing metadata: ${post.title}`, true);
      return;
    }

    const postDirectory = `${targetDir}/${filenameBase}`;
    this.fsService.ensureDirectoryExists(postDirectory);

    for (const { media_id, id } of post.gallery_data.items) {
      const media = post.media_metadata[media_id];
      if (!media || !media.s || !media.s.u) continue;

      const downloadUrl = media.s.u.replaceAll('&amp;', '&');
      
      // Construct a fake mini-post to reuse MediaDownloader logic
      const miniPost = {
        ...post,
        url: downloadUrl,
        post_hint: 'image', // force image handling
      } as RedditPost;

      await this.mediaDownloader.download(miniPost, postDirectory, id.toString());
    }
  }
}