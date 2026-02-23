import * as path from 'path';
import { Config, ValidationResult } from '../types';
import { injectable, inject } from 'tsyringe';
import { DatabaseService } from './DatabaseService';

export const defaultConfig: Config = {
  testingMode: false,
  testingModeOptions: {
    subredditList: ['AskReddit', 'pics'],
    numberOfPosts: 25,
    sorting: 'new',
    time: 'month',
    repeatForever: true,
    timeBetweenRuns: 30000,
  },
  local_logs: true,
  local_logs_naming_scheme: {
    showDateAndTime: true,
    showSubreddits: true,
    showNumberOfPosts: true,
  },
  download_comments: false,
  redownload_posts: false,
  use_history_database: true,
  prevent_duplicates: true,
  duplicate_threshold: 5,
  detailed_logs: false,
  rate_limit_delay_ms: 2000,
  download_youtube_videos_experimental: true,
};

@injectable()
export class ConfigService {
  constructor(@inject(DatabaseService) private dbService: DatabaseService) {}

  public static load(): Config {
    return { ...defaultConfig };
  }

  public async getConfig(): Promise<Config> {
    const dbSettings = await this.dbService.getAllSettings();
    const defaultConfig = ConfigService.load();

    if (Object.keys(dbSettings).length === 0) {
      // First run or empty DB, initialize with default
      await this.saveConfig(defaultConfig);
      return defaultConfig;
    }

    // Merge DB settings into default config
    const config = { ...defaultConfig };

    for (const [key, value] of Object.entries(dbSettings)) {
      try {
        const parsedValue = JSON.parse(value as string);
        (config as any)[key] = parsedValue;
      } catch (e) {
        (config as any)[key] = value;
      }
    }

    return config;
  }

  public async saveConfig(config: Config): Promise<void> {
    for (const [key, value] of Object.entries(config)) {
      const valueToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await this.dbService.setSetting(key, valueToStore);
    }
  }

  public static validate(config: Config): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Base validation for settings if needed

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * Parse a post list content (lines of URLs)
   */
  public static parsePostListContent(content: string): string[] {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
  }
}
