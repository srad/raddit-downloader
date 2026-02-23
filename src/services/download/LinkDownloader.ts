import { Downloader } from './Downloader';
import { RedditPost } from '../../types';
import { FileSystemService } from '../FileSystemService';
import { PostType, getPostType } from '../../utils/postUtils';
import { injectable, inject } from 'tsyringe';

@injectable()
export class LinkDownloader implements Downloader {
  constructor(@inject(FileSystemService) private fsService: FileSystemService) {}

  canHandle(post: RedditPost): boolean {
    return getPostType(post) === PostType.Link;
  }

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<string[]> {
    const filename = `${filenameBase}.html`;
    const filePath = `${targetDir}/${filename}`;

    if (this.fsService.fileExists(filePath)) {
      return [filename];
    }

    const htmlContent = `<html><body><script type='text/javascript'>window.location.href = "${post.url}";</script></body></html>`;
    await this.fsService.writeFile(filePath, htmlContent);
    return [filename];
  }
}
