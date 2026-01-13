import { DEFAULT_REQUEST_TIMEOUT } from '../config/constants';
import { singleton } from 'tsyringe';

@singleton()
export class RedditApiService {
  private userAgent = 'EasyRedditDownloader/2.0';

  constructor() {}

  public async fetchSubredditPosts(
    subreddit: string,
    sorting: string,
    time: string,
    limit: number,
    after: string = '',
  ): Promise<any> {
    const url = `https://www.reddit.com/r/${subreddit}/${sorting}/.json?sort=${sorting}&t=${time}&limit=${limit}&after=${after}`;
    return this.fetchJson(url);
  }

  public async fetchUserPosts(
    username: string,
    limit: number,
    after: string = '',
  ): Promise<any> {
    const url = `https://www.reddit.com/user/${username}/submitted/.json?limit=${limit}&after=${after}`;
    return this.fetchJson(url);
  }

  public async fetchPost(url: string): Promise<any> {
    return this.fetchJson(url + '.json');
  }

  private async fetchJson(url: string): Promise<any> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Reddit API responded with ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(id);
    }
  }

  public async checkUpdates(): Promise<string | null> {
    try {
      const response = await fetch(
        'https://api.github.com/repos/josephrcox/easy-reddit-downloader/releases/latest',
        {
          headers: { 'User-Agent': 'Downloader' },
        },
      );
      if (!response.ok) return null;
      const data: any = await response.json();
      return data.tag_name;
    } catch {
      return null;
    }
  }
}