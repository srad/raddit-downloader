import { Downloader } from './Downloader';
import { RedditPost, Config } from '../../types';
import { FileSystemService } from '../FileSystemService';
import { PostType, getPostType } from '../../utils/postUtils';
import { LoggerService } from '../LoggerService';
import { injectable, inject } from 'tsyringe';
import { CONFIG_TOKEN } from '../../config/tokens';

import ytdl from 'ytdl-core';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import * as fs from 'fs';

@injectable()
export class YouTubeDownloader implements Downloader {
  constructor(
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(LoggerService) private loggerService: LoggerService,
    @inject(CONFIG_TOKEN) private config: Config
  ) {}

  canHandle(post: RedditPost): boolean {
    return (this.config.download_youtube_videos_experimental ?? false) && 
           getPostType(post) === PostType.Link && 
           post.domain.includes('youtu');
  }

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<string> {
    const filename = `${filenameBase}.mp4`;

    if (!ytdl || !ffmpegPath) {
      this.loggerService.log('YouTube download dependencies not available', true);
      return filename;
    }

    this.loggerService.log(`Downloading ${filenameBase} from YouTube... This may take a while...`, false);

    try {
      if (!ytdl.validateURL(post.url)) {
        throw new Error('Invalid YouTube URL');
      }

      const info = await ytdl.getInfo(post.url);
      const format = ytdl.chooseFormat(info.formats, { quality: 'highest' });
      const fileName = `${filenameBase}.mp4`;
      const audioPath = `${targetDir}/${filenameBase}.mp3`;
      const videoPath = `${targetDir}/${filenameBase}.mp4`; // Temp video path
      
      const tempVideoPath = `${targetDir}/${filenameBase}_temp_video.mp4`;

      const audio = ytdl(post.url, { filter: 'audioonly' });
      audio.pipe(fs.createWriteStream(audioPath));

      const video = ytdl(post.url, { format });
      video.pipe(fs.createWriteStream(tempVideoPath));

      await Promise.all([
        new Promise((resolve) => audio.on('end', resolve)),
        new Promise((resolve) => video.on('end', resolve)),
      ]);

      await new Promise<void>((resolve, reject) => {
        if (!ffmpegPath) {
          reject(new Error('ffmpeg binary not found'));
          return;
        }

        // Merge video and audio using ffmpeg
        const args = [
          '-i', tempVideoPath,
          '-i', audioPath,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-y',
          `${targetDir}/${fileName}`
        ];

        const ffmpegProcess = spawn(ffmpegPath, args);
        let stderrOutput = '';

        ffmpegProcess.stderr.on('data', (data) => {
          stderrOutput += data.toString();
        });

        ffmpegProcess.on('close', (code) => {
          this.fsService.deleteFile(audioPath);
          this.fsService.deleteFile(tempVideoPath);

          if (code !== 0) {
            reject(new Error(`ffmpeg exited with code ${code}: ${stderrOutput.slice(-200)}`));
          } else {
            resolve();
          }
        });

        ffmpegProcess.on('error', (err) => {
          this.fsService.deleteFile(audioPath);
          this.fsService.deleteFile(tempVideoPath);
          reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
        });
      });

      return filename;
    } catch (error) {
      this.loggerService.log(
        `Failed to download ${filenameBase} from YouTube. Do you have FFMPEG installed? https://ffmpeg.org/`,
        false,
      );
      throw error;
    }
  }
}