import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../types';

const CONFIG_PATH = path.join(__dirname, '../../user_config.json');
const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../user_config_DEFAULT.json');
const POST_LIST_PATH = path.join(__dirname, '../../download_post_list.txt');

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export class ConfigService {
  public static load(): Config {
    let config: Config;

    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } else {
      if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
        fs.copyFileSync(DEFAULT_CONFIG_PATH, CONFIG_PATH);
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        console.log('user_config.json was created. Edit it to manage user options.');
      } else {
        throw new Error('Default configuration file not found at ' + DEFAULT_CONFIG_PATH);
      }
    }

    return config;
  }

  public static validate(config: Config): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    const namingScheme = config.file_naming_scheme || {};
    const activeCount =
      (namingScheme.showDate === true ? 1 : 0) +
      (namingScheme.showAuthor === true ? 1 : 0) +
      (namingScheme.showTitle === true ? 1 : 0);

    if (activeCount === 0) {
      errors.push(
        'Your file naming scheme (user_config.json) does not have any options set. ' +
          'You cannot download posts without filenames.',
      );
    } else if (activeCount < 2) {
      warnings.push(
        'Your file naming scheme (user_config.json) is poorly set, we recommend changing it.',
      );
    }

    // Check if at least one post type is enabled
    const postTypesEnabled =
      config.download_gallery_posts ||
      config.download_self_posts ||
      config.download_media_posts ||
      config.download_link_posts;

    if (!postTypesEnabled) {
      errors.push('No post types are enabled for download');
    }

    if (errors.length > 0 || warnings.length > 0) {
      warnings.push(
        'Read about recommended naming schemes here - ' +
          'https://github.com/srad/raddit-downloader/blob/main/README.md#File-naming-scheme',
      );
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  public static ensurePostListFile(): void {
    if (!fs.existsSync(POST_LIST_PATH)) {
      const defaultContent = `# Below, please list any posts that you wish to download. #
# They must follow this format below: #
# https://www.reddit.com/r/gadgets/comments/ptt967/eu_proposes_mandatory_usbc_on_all_devices/ #
# Lines with "#" at the start will be ignored (treated as comments). #`;
      fs.writeFileSync(POST_LIST_PATH, defaultContent);
      console.log('download_post_list.txt was created with default content.');
    }
  }

  public static readPostListFile(): string[] {
    if (!fs.existsSync(POST_LIST_PATH)) {
      return [];
    }
    const content = fs.readFileSync(POST_LIST_PATH, 'utf8');
    return this.parsePostListContent(content);
  }

  public static parsePostListContent(content: string): string[] {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !line.startsWith('#') &&
          line.startsWith('https://www.reddit.com') &&
          line.includes('/comments/'),
      );
  }
}
