# RadditDownloader

A Reddit content crawler with CLI, web, and desktop interface for subreddits and user profiles.

Fork from [easy-reddit-downloader](https://github.com/josephrcox/easy-reddit-downloader) - almost entirely rewritten in TypeScript, dependency injection, and comprehensive testing.

This project is especially useful for gathering data for machine learning projects.

![Test Coverage](https://img.shields.io/badge/tests-89%20passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Media Download:** Images (jpg, png, gif, webp), videos (mp4, webm), galleries, text posts
- **Third-Party Support:** Gfycat, Imgur, YouTube (experimental), RedGifs
- **Smart Filtering:** Content-Type validation prevents invalid downloads (HTML error pages saved as images)
- **Deduplication:** SQLite database tracks downloads, automatic skip of existing files, redownload missing files
- **Duplicate Detection:** Perceptual hash (pHash) based duplicate detection with multi-frame video analysis
- **Web Gallery:** Real-time progress monitoring, thumbnail generation, file browsing, and file management
- **Desktop App:** Electron-based desktop version with system tray integration
- **Type Safe:** Full TypeScript with dependency injection and 89 unit tests

## Quick Start

### Option 1: Download Release (Recommended)

1. Download the latest release from [GitHub Releases](https://github.com/srad/raddit-downloader/releases)
2. Extract and run the executable
3. Follow the interactive prompts

### Option 2: Run from Source

```bash
# Clone and install
git clone https://github.com/srad/raddit-downloader.git
cd raddit-downloader
npm install

# Build and run
npm run build
npm start
```

## Usage

### CLI Mode

```bash
npm start              # Interactive CLI prompts
npm run web           # Web interface at http://localhost:3000
npm run desktop       # Desktop app (Electron)
```

The CLI will ask you:
- Subreddit or user profile to download from (e.g., `pics` or `u/username`)
- Number of posts (or `all` for unlimited)
- Sort method: `Top`, `New`, `Hot`, `Rising`, `Controversial`
- Time period: `All`, `Year`, `Month`, `Week`, `Day`, `Hour`
- Run on repeat (continuous monitoring)

### Web Interface

```bash
npm run web
```

Features:
- Real-time download progress per batch
- File browser with thumbnails
- Gallery lightbox viewer
- Log streaming
- Runs on `http://localhost:3000`

### Desktop App

```bash
npm run desktop
```

Electron-based desktop version with auto-assigned ports to avoid conflicts.

### Duplicate Detection

RadditDownloader uses perceptual hashing (pHash) to detect duplicate and similar media files:

#### Finding Duplicates

**CLI Commands:**
```bash
# Find duplicates with default threshold (5 bits)
npm run web -- --find-duplicates

# Find duplicates with custom threshold (higher = less strict)
npm run web -- --find-duplicates=8

# Generate phashes for existing downloads
npm run web -- --generate-phash
```

**Web API:**
```bash
# Get duplicates via API
GET http://localhost:3000/api/duplicates?threshold=5

# Trigger background phash generation
POST http://localhost:3000/api/duplicates/generate

# Delete a duplicate file
DELETE http://localhost:3000/api/duplicates/:id
```

#### How It Works

**For Images:**
- Generates a single 64-bit perceptual hash per image
- Hash is invariant to resizing, compression, and minor edits
- Hamming distance used to compare similarity

**For Videos:**
- Extracts 5 frames at 10%, 30%, 50%, 70%, and 90% of video duration
- Generates phash for each frame
- Uses voting system: duplicates if 3+ frames match (60% confidence)
- Avoids false positives from identical intros/outros

**Thresholds:**
- `0-5 bits`: Near identical (recommended for duplicates)
- `6-10 bits`: Similar with minor differences
- `11+ bits`: Different files

#### Automatic Background Processing

- **On Download:** Phash generated automatically for every new download
- **On Startup:** Missing phashes generated in background for existing files
- **Real-time Progress:** Socket.IO events track generation progress in web UI

#### Storage

- Phashes stored in SQLite database (`data/data.db`)
- Images: Single hex string (~16 bytes)
- Videos: JSON array of 5 hashes (~80 bytes)
- Indexed for fast duplicate detection queries

## Configuration

Edit `user_config.json` (created on first run):

```json
{
  "use_history_database": true,          // Track and skip downloaded files
  "redownload_posts": false,             // Force re-download existing posts
  "download_gallery_posts": true,        // Include Reddit galleries
  "download_youtube_videos_experimental": false,  // Requires ffmpeg
  "rate_limit_delay_ms": 1000,           // Delay between API requests
  "nsfw_separate_folder": false          // Separate NSFW content
}
```

Filenames are automatically formatted as: `subreddit_YYYY-MM-DD_HH-MM-SS.ext`

## Development

### Project Structure

```
src/
├── runners/              # Entry points (CLI, Web, Desktop)
├── services/
│   ├── download/         # Downloader strategies (Media, Gallery, RedGifs, YouTube)
│   ├── DownloadOrchestrator.ts
│   ├── DatabaseService.ts
│   ├── ThumbnailService.ts
│   ├── PhashService.ts   # Perceptual hash generation and duplicate detection
│   └── FileSystemService.ts
├── utils/                # Helpers (filename, post detection)
├── types/
│   ├── index.ts          # Core TypeScript interfaces
│   └── phash.ts          # Duplicate detection types
└── types.ts             # TypeScript interfaces

__tests__/               # Jest unit tests
public/                  # Web UI assets
data/                    # Runtime files (database, downloads, thumbnails)
```

### Running Tests

```bash
npm test                          # Run all tests
npm test -- --selectProjects=unit # Unit tests only
npm test -- --selectProjects=e2e  # E2E tests only
npm run test:watch               # Watch mode
npm run test:coverage            # Coverage report
```

### Key Architecture

- **Strategy Pattern:** Each downloader (`MediaDownloader`, `GalleryDownloader`, etc.) handles specific post types
- **Dependency Injection:** Uses `tsyringe` for testability and modularity
- **Content-Type Validation:** Prevents HTML error pages from being saved as images
- **Database Migrations:** Automatic schema updates on version changes
- **Portable Paths:** Stores relative paths (`r_pics/file.jpg`) for portability

### Adding a New Downloader

1. Implement the `Downloader` interface in `src/services/download/`
2. Register in `src/services/download/index.ts`
3. Add tests in `__tests__/`

Example:
```typescript
@injectable()
export class MyDownloader implements Downloader {
  canHandle(post: RedditPost): boolean {
    return post.domain.includes('example.com');
  }

  async download(post: RedditPost, targetDir: string, filenameBase: string): Promise<string> {
    // Download logic
  }
}
```

## Technical Details

### Reddit API

- **No Authentication Required:** Uses public JSON API (`https://reddit.com/r/{subreddit}.json`)
- **Rate Limiting:** Respects `X-Ratelimit-*` headers with exponential backoff
- **User-Agent:** Custom UA to avoid 429 errors

### Download Strategy

1. **Post Type Detection:** Analyzes `post_hint`, `domain`, and metadata
2. **URL Extraction:** Prioritizes highest quality sources:
   - `media.reddit_video.fallback_url` (full quality video)
   - `preview.images[0].source.url` (full resolution image)
   - `url_overridden_by_dest` (external media)
3. **Content Validation:** Checks `Content-Type` header before saving
4. **Error Handling:** Logs failures but continues batch processing

### File Storage

- **Database:** SQLite in `data/data.db` with relative paths and phashes
- **Downloads:** Organized by subreddit in `data/downloads/r_{subreddit}/`
- **Thumbnails:** Auto-generated in `data/thumbnails/` using Sharp and FFmpeg
- **Deduplication:** Tracks by Reddit post ID and perceptual hash, skips if file exists

## Troubleshooting

**403 Errors:** Some CDNs block downloads. The app uses browser-like headers with proper `Referer` and `User-Agent`.

**HTML files saved as images:** Fixed in v1.0+ with Content-Type validation. Update to latest version.

**YouTube downloads fail:** Set `download_youtube_videos_experimental: true` and install ffmpeg.

**Port already in use:** Web interface auto-selects available ports. Desktop app uses dynamic port assignment.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details

## Credits

Original project by [Joseph R. Cox](https://github.com/josephrcox/easy-reddit-downloader)
This fork for by [srad](https://github.com/srad)