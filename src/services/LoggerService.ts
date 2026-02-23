import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { injectable, inject } from 'tsyringe';
import { Config as ConfigType, ValidationResult } from '../types';
import { ALL_POSTS as ALL_POSTS_CONST, DATA_DIR } from '../config/constants';
import { CONFIG_TOKEN } from '../config/tokens';

@injectable()
export class LoggerService {
  private userLogs = '';
  private dateString: string;
  private readonly LOGS_DIR = path.join(DATA_DIR, 'logs');
  private readonly LOG_FORMAT = 'txt';

  constructor(@inject(CONFIG_TOKEN) private config: ConfigType) {
    const date = new Date();
    this.dateString = `${date.getFullYear()} ${
      date.getMonth() + 1
    } ${date.getDate()} at ${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
  }

  public log = (
    message: string,
    detailed: boolean = false,
    subredditList: string[] = [],
    numberOfPosts: number = 0,
  ): void => {
    this.userLogs += message + '\r\n';

    const visibleToUser = !detailed || this.config.detailed_logs;

    if (visibleToUser) {
      console.log(message);
    }

    if (this.config.local_logs && subredditList.length > 0) {
      this.writeLogFile(subredditList, numberOfPosts);
    }
  };

  private async writeLogFile(subredditList: string[], numberOfPosts: number): Promise<void> {
    if (!fs.existsSync(this.LOGS_DIR)) {
      fs.mkdirSync(this.LOGS_DIR, { recursive: true });
    }

    let logFileName = '';
    const naming = this.config.local_logs_naming_scheme;

    if (naming.showDateAndTime) {
      logFileName += `${this.dateString} - `;
    }

    if (naming.showSubreddits) {
      const subredditListString = JSON.stringify(subredditList).replace(/[^a-zA-Z0-9,]/g, '');
      logFileName += `${subredditListString} - `;
    }

    if (naming.showNumberOfPosts) {
      if (numberOfPosts >= ALL_POSTS_CONST) {
        logFileName += `ALL - `;
      } else {
        logFileName += `${numberOfPosts} - `;
      }
    }

    if (logFileName.endsWith(' - ')) {
      logFileName = logFileName.substring(0, logFileName.length - 3);
    }

    try {
      await fs.promises.writeFile(`${this.LOGS_DIR}/${logFileName}.${this.LOG_FORMAT}`, this.userLogs);
      // Clear logs after writing to prevent unbounded memory growth
      this.userLogs = '';
    } catch (err) {
      console.error('Failed to write log file:', err);
    }
  }

  public logWelcome(): void {
    console.clear();
    this.log(chalk.cyan('👋 Welcome to the easiest & most customizable Reddit Post Downloader!'), false);
    this.log(chalk.yellow('😎 Contribute @ https://github.com/srad/raddit-downloader'), false);
    this.log(
      chalk.blue('🤔 Confused? Check out the README @ https://github.com/srad/raddit-downloader#readme\n'),
      false,
    );
  }

  public logValidation(validation: ValidationResult): void {
    for (const warning of validation.warnings) {
      this.log(chalk.red('WARNING: ' + warning), false);
    }
    for (const error of validation.errors) {
      this.log(chalk.red('ALERT: ' + error), false);
    }
  }

  public logVersionInfo(currentVersion: string, latestVersion: string): void {
    if (currentVersion !== latestVersion) {
      this.log(
        `Hey! A new version (${latestVersion}) is available. \nConsider updating to the latest version with 'git pull'.\n`,
        false,
      );
    } else {
      this.log('You are on the latest stable version (' + currentVersion + ')\n', true);
    }
  }
}
