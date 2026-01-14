import { Downloader } from './Downloader';
import { RedditPost, Config } from '../../types';
import { FileSystemService } from '../FileSystemService';
import { PostType, getPostType } from '../../utils/postUtils';
import { RedditApiService } from '../RedditApiService';
import { LoggerService } from '../LoggerService';
import { injectable, inject } from 'tsyringe';
import { CONFIG_TOKEN } from '../../config/tokens';

@injectable()
export class TextDownloader implements Downloader {
  constructor(
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(RedditApiService) private apiService: RedditApiService,
    @inject(CONFIG_TOKEN) private config: Config,
    @inject(LoggerService) private loggerService: LoggerService,
  ) {}

  canHandle(post: RedditPost): boolean {
    return getPostType(post) === PostType.Self;
  }

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<string> {
    const filename = `${filenameBase}.txt`;
    const filePath = `${targetDir}/${filename}`;

    if (this.fsService.fileExists(filePath)) {
      return filename;
    }

    let content = `${post.title} by ${post.author}\n\n`;
    content += `${post.selftext}\n`;
    content += '------------------------------------------------\n\n';

    if (this.config.download_comments) {
      try {
        const postData = await this.apiService.fetchPost(post.url);
        content += '--COMMENTS--\n\n';
        const commentsResponse = postData.length > 1 ? postData[1] : null;
        if (commentsResponse && commentsResponse.data && commentsResponse.data.children) {
          for (const child of commentsResponse.data.children) {
            // Reddit comment API returns complex nested structures that vary
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const comment = child.data as any;
            if (comment.author && comment.body) {
              content += `${comment.author}:\n${comment.body}\n`;
              if (comment.replies?.data?.children?.[0]?.data) {
                const topReply = comment.replies.data.children[0].data;
                content += `\t>\t${topReply.author}:\n\t>\t${topReply.body}\n`;
              }
              content += '\n\n\n';
            }
          }
        }
      } catch (error) {
        this.loggerService.log(`Failed to fetch comments for: ${post.title}`, true);
      }
    }

    await this.fsService.writeFile(filePath, content);
    return filename;
  }
}