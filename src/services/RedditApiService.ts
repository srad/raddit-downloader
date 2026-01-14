import { DEFAULT_REQUEST_TIMEOUT } from '../config/constants';
import { singleton } from 'tsyringe';
import { RedditApiResponse } from '../types';

export interface RateLimitInfo {
  remaining: number;
  used: number;
  reset: number; // Unix timestamp
}

@singleton()
export class RedditApiService {
  private userAgent = 'RadditDownloader/2.0 (by /u/reddit; https://github.com/srad/raddit-downloader)';
  private lastRequestTime = 0;
  private readonly minRequestDelay = 2000; // 2 seconds for safety (30 req/min)
  private rateLimitInfo: RateLimitInfo | null = null;
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 5000; // 5 seconds base delay for exponential backoff
  private logger?: (message: string) => void;

  constructor() {}

  /**
   * Set a logger callback for debugging rate limit issues
   */
  public setLogger(logger: (message: string) => void): void {
    this.logger = logger;
  }

  private log(message: string): void {
    if (this.logger) {
      this.logger(message);
    } else {
      console.log(message);
    }
  }

  public async fetchSubredditPosts(
    subreddit: string,
    sorting: string,
    time: string,
    limit: number,
    after: string = '',
    signal?: AbortSignal
  ): Promise<RedditApiResponse> {
    const url = `https://www.reddit.com/r/${subreddit}/${sorting}/.json?sort=${sorting}&t=${time}&limit=${limit}&after=${after}`;
    return this.fetchJson<RedditApiResponse>(url, signal);
  }

  public async fetchUserPosts(
    username: string,
    limit: number,
    after: string = '',
    signal?: AbortSignal
  ): Promise<RedditApiResponse> {
    const url = `https://www.reddit.com/user/${username}/submitted/.json?limit=${limit}&after=${after}`;
    return this.fetchJson<RedditApiResponse>(url, signal);
  }

  public async fetchPost(url: string, signal?: AbortSignal): Promise<RedditApiResponse[]> {
    return this.fetchJson<RedditApiResponse[]>(url + '.json', signal);
  }

  private async fetchJson<T = RedditApiResponse>(url: string, signal?: AbortSignal, retryCount = 0): Promise<T> {
    if (signal?.aborted) {
        throw new Error('Aborted');
    }

    // Check if we need to wait for rate limit reset
    if (this.rateLimitInfo && this.rateLimitInfo.remaining === 0) {
      const now = Date.now();
      const resetTime = this.rateLimitInfo.reset * 1000; // Convert to milliseconds
      if (now < resetTime) {
        const waitTime = resetTime - now + 1000; // Add 1 second buffer
        this.log(`Rate limit exhausted. Waiting ${Math.round(waitTime / 1000)}s until reset...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Rate Limiting - update timestamp BEFORE delay to prevent race conditions
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < this.minRequestDelay) {
        const wait = this.minRequestDelay - timeSinceLast;
        this.lastRequestTime = now + wait; // Reserve this time slot before waiting
        await new Promise(resolve => setTimeout(resolve, wait));
    } else {
        this.lastRequestTime = now;
    }

    // Timeout Controller
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT);

    // Link external signal to internal controller
    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
        },
        signal: controller.signal,
      });

      // Extract rate limit information from response headers
      this.updateRateLimitInfo(response);

      // Handle rate limiting - check response headers for proper timing
      if (response.status === 429 || response.status === 403) {
        // Log rate limit headers for debugging
        const rateLimitHeaders = {
          remaining: response.headers.get('x-ratelimit-remaining'),
          used: response.headers.get('x-ratelimit-used'),
          reset: response.headers.get('x-ratelimit-reset'),
          retryAfter: response.headers.get('retry-after'),
        };
        this.log(`Rate limit headers: ${JSON.stringify(rateLimitHeaders)}`);

        // Check if this is a hard block (403 with no useful headers)
        const isHardBlock = response.status === 403 &&
                           !rateLimitHeaders.remaining &&
                           !rateLimitHeaders.reset &&
                           (!rateLimitHeaders.retryAfter || rateLimitHeaders.retryAfter === '0');

        if (isHardBlock) {
          throw new Error(
            `Access forbidden (403). Your IP appears to be blocked by Reddit. ` +
            `Try: 1) Wait 30-60 minutes, 2) Use a VPN, 3) Change your IP address. ` +
            `Reddit provided no rate limit information, suggesting a hard IP block.`
          );
        }

        if (retryCount < this.maxRetries) {
          const waitTime = this.getRetryWaitTime(response, retryCount);

          const statusMsg = response.status === 429 ? 'Rate limited' : 'Access forbidden';
          this.log(`${statusMsg} (${response.status}). Retrying in ${Math.round(waitTime / 1000)}s... (Attempt ${retryCount + 1}/${this.maxRetries})`);

          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.fetchJson<T>(url, signal, retryCount + 1);
        } else {
          const errorMsg = response.status === 429
            ? `Rate limit exceeded after ${this.maxRetries} retries. Reddit's rate limit window may need to reset.`
            : `Access forbidden (403) after ${this.maxRetries} retries. Your IP may be temporarily blocked by Reddit.`;
          throw new Error(errorMsg);
        }
      }

      if (!response.ok) {
        throw new Error(`Reddit API responded with ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(id);
    }
  }

  /**
   * Determines how long to wait before retrying based on response headers
   * Prioritizes: Retry-After > X-Ratelimit-Reset > Exponential backoff
   */
  private getRetryWaitTime(response: Response, retryCount: number): number {
    const minWaitTime = 5000; // Minimum 5 seconds between retries

    // Priority 1: Check for Retry-After header (Reddit's explicit instruction)
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = parseInt(retryAfter);
      if (!isNaN(seconds) && seconds > 0) {
        // Only use if it's a reasonable value (ignore 0 or negative)
        const waitTime = Math.max(seconds * 1000, minWaitTime);
        this.log(`Reddit says: Retry after ${Math.round(waitTime / 1000)}s (from Retry-After header)`);
        return waitTime;
      } else {
        this.log(`Reddit sent Retry-After: ${seconds}s (ignoring, will use fallback)`);
      }
    }

    // Priority 2: Check X-Ratelimit-Reset (when the rate limit window resets)
    const resetHeader = response.headers.get('x-ratelimit-reset');
    if (resetHeader) {
      const resetTimestamp = parseFloat(resetHeader);
      if (!isNaN(resetTimestamp)) {
        const now = Date.now();
        const resetTime = resetTimestamp * 1000;
        const waitTime = resetTime - now + 1000; // Add 1s buffer

        if (waitTime > minWaitTime && waitTime < 300000) { // Between 5s and 5 minutes
          const resetDate = new Date(resetTime);
          this.log(`Rate limit resets at ${resetDate.toLocaleTimeString()} (from X-Ratelimit-Reset header)`);
          return waitTime;
        }
      }
    }

    // Priority 3: Fallback to exponential backoff (minimum 5s)
    const waitTime = Math.max(this.baseRetryDelay * Math.pow(2, retryCount), minWaitTime);
    this.log(`No useful retry headers, using exponential backoff: ${Math.round(waitTime / 1000)}s`);
    return waitTime;
  }

  /**
   * Updates rate limit info from Reddit API response headers
   */
  private updateRateLimitInfo(response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const used = response.headers.get('x-ratelimit-used');
    const reset = response.headers.get('x-ratelimit-reset');

    if (remaining !== null && used !== null && reset !== null) {
      this.rateLimitInfo = {
        remaining: parseFloat(remaining),
        used: parseFloat(used),
        reset: parseFloat(reset),
      };

      // Log warning if we're getting close to the limit
      if (this.rateLimitInfo.remaining < 10) {
        const resetDate = new Date(this.rateLimitInfo.reset * 1000);
        this.log(`Warning: Only ${Math.floor(this.rateLimitInfo.remaining)} requests remaining until ${resetDate.toLocaleTimeString()}`);
      }
    }
  }

  public async checkUpdates(): Promise<string | null> {
    try {
      const response = await fetch(
        'https://api.github.com/repos/srad/raddit-downloader/releases/latest',
        {
          headers: { 'User-Agent': 'Downloader' },
        },
      );
      if (!response.ok) return null;
      const data = await response.json() as { tag_name: string };
      return data.tag_name;
    } catch {
      return null;
    }
  }

  /**
   * Gets the current rate limit status
   * Useful for debugging and monitoring API usage
   */
  public getRateLimitStatus(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Sets a custom minimum delay between requests (in milliseconds)
   * Default is 2000ms (30 requests/minute)
   * @param delayMs Delay in milliseconds (minimum 1000ms recommended)
   */
  public setMinRequestDelay(delayMs: number): void {
    if (delayMs < 1000) {
      this.log('Warning: Setting request delay below 1000ms may result in rate limiting');
    }
    (this as any).minRequestDelay = delayMs;
  }
}
