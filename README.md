# Raddit Downloader

Reddit content downloader for subreddits and user profiles with CLI and web interfaces.

Fork from https://github.com/josephrcox/easy-reddit-downloader - fully rewritten with TypeScript, dependency injection, and comprehensive testing.

Useful for gathering training data, archiving content, or backing up posts.

## Features

Any content type that Reddit pretty much supports as content-type is supported.
If you find a new or missing content type then open a ticket please.

- **Download Media:** Images (jpg, png, gif), videos (mp4, webm), galleries, text posts, and links
- **Third-Party Support:** RedGifs, Gfycat, Imgur with API integration
- **Bulk Operations:** Download unlimited posts from multiple sources
- **Smart Storage:** Portable database with relative paths, automatic deduplication
- **Type Safe:** Full TypeScript with dependency injection (tsyringe)
- **Tested:** 88+ unit tests with comprehensive coverage

## Installation

1.  **Clone the repository:**
    ```bash
    git clone git@github.com:srad/raddit-downloader.git
    cd raddit-downloader
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the project:**
    ```bash
    npm run build
    ```

## Usage

### Interactive Mode

Simply run the start command and follow the prompts:

```bash
npm start
```

You will be asked:
- Which subreddits/users to download from
- How many posts to download
- Sorting method (Top, New, Hot, etc.)
- Time period (All time, Month, Week, etc.)
- Whether to run on repeat

### Configuration

`user_config.json` (created on first run):

- `file_naming_scheme`: Filename format - currently fixed as `subreddit_YYYY-MM-DD_HH-MM-SS`
- `use_history_database`: Enable/disable download history tracking (default: true)
- `redownload_posts`: Re-download previously downloaded posts (default: false)
- `download_gallery_posts`: Include gallery posts (default: true)
- `download_youtube_videos_experimental`: Requires ffmpeg (default: false)
- `rate_limit_delay_ms`: Delay between Reddit API requests (default: 1000)

### Web Interface

Run the web UI:
```bash
npm run web
```

Access at `http://localhost:3000` - provides real-time download progress and file browsing.

## Development

### Running Tests

```bash
npm test              # All tests
npm test -- --selectProjects=unit    # Unit tests only
```

### Project Structure

- `src/runners/`: Entry points (CLI, Web)
- `src/services/`: Core logic with DI
  - `download/`: Strategy pattern downloaders (Media, Gallery, RedGifs, YouTube, Text, Link)
  - `DownloadOrchestrator.ts`: Coordinates downloads
  - `DatabaseService.ts`: SQLite history with automatic migration
- `src/utils/`: Helpers (filename, post type detection)
- `data/`: Runtime files (data.db, downloads/, logs/)

### Key Patterns

- **Strategy Pattern:** Downloaders register and handle specific post types
- **Dependency Injection:** tsyringe for testability
- **Migration System:** Automatic database schema updates on startup

## Technical Notes

- **No Authentication:** Uses Reddit JSON API (no OAuth required)
- **Rate Limiting:** Respects `X-Ratelimit-*` headers with exponential backoff
- **File Extensions:** Extracts from URLs - fails if indeterminable (no guessing)
- **Database:** Portable relative paths (`r_pics/file.jpg` not `/abs/path/`)

## License

MIT