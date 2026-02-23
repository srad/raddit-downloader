<p align="center">
  <img src="frontend/assets/logo.png" alt="RadditDownloader Logo" width="120" />
</p>

<h1 align="center">RadditDownloader</h1>

<p align="center">
  <strong>A Reddit content crawler with CLI, web, and desktop interface for subreddits and user profiles.</strong>
</p>

<p align="center">
  <a href="https://github.com/srad/raddit-downloader/releases"><img src="https://img.shields.io/badge/version-2.0.1-blue?style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform"><br/>
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vue.js-3-4FC08D?style=flat-square&logo=vue.js&logoColor=white" alt="Vue.js">
  <img src="https://img.shields.io/badge/Electron-33-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/tests-89%20passing-brightgreen?style=flat-square" alt="Tests">
</p>

<p align="center">
  Fork from <a href="https://github.com/josephrcox/easy-reddit-downloader">easy-reddit-downloader</a> - almost entirely rewritten in TypeScript, with dependency injection, and comprehensive testing.<br>
  Especially useful for gathering data for machine learning projects, with automatic thumbnail generation for images and videos.
</p>

---

<p align="center">
  <img alt="RadditDownloader Screenshot" width="900" alt="screenshot-1" src="https://github.com/user-attachments/assets/9fb5d610-6e80-46d7-9ac9-c42f6f016fd0" />
</p>

---

## Highlights

- **Media Download** &mdash; Images (jpg, png, gif, webp), videos (mp4, webm), galleries, and text posts
- **Smart Filtering** &mdash; Content-Type validation prevents invalid downloads (e.g., HTML error pages saved as images)
- **Deduplication** &mdash; SQLite database tracks downloads, automatically skips existing files, and handles missing files
- **Duplicate Detection** &mdash; Perceptual hash (pHash) based detection with multi-frame video analysis
- **Web Gallery** &mdash; Real-time progress monitoring, thumbnail generation, file browsing, and management
- **Desktop App** &mdash; Electron-based desktop version with system tray integration
- **Type Safe** &mdash; Full TypeScript codebase with dependency injection and comprehensive unit tests

## Features

- **Third-Party Support:** Gfycat, Imgur, YouTube (experimental), RedGifs
- **Web Interface:** Real-time download progress, file browser with thumbnails, lightbox viewer, and log streaming
- **Desktop Integration:** Runs as a standalone application with auto-assigned ports
- **Portable Paths:** Stores relative paths for database portability

## Tech Stack

| Layer                 | Technology                                                         |
| --------------------- | ------------------------------------------------------------------ |
| **Runtime**           | Node.js, Electron                                                  |
| **Frontend**          | Vue 3, Vite, TypeScript, SCSS                                      |
| **Backend**           | TypeScript, SQLite                                                 |
| **Build / Packaging** | [Electron Forge](https://www.electronforge.io/)                    |
| **Libraries**         | tsyringe (DI), sharp (Image processing), ffmpeg (Video processing) |

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
```

The CLI will ask you:

- Subreddit or user profile to download from (e.g., `pics` or `u/username`)
- Number of posts (or `all` for unlimited)
- Sort method: `Top`, `New`, `Hot`, `Rising`, `Controversial`
- Time period: `All`, `Year`, `Month`, `Week`, `Day`, `Hour`
- Run on repeat (continuous monitoring)

### Web Interface

```bash
npm run web           # Web interface at http://localhost:3000
```

Features:

- Real-time download progress per batch
- File browser with thumbnails
- Gallery lightbox viewer
- Log streaming

### Desktop App

```bash
npm run desktop       # Desktop app (Electron)
```

Electron-based desktop version with auto-assigned ports to avoid conflicts.

## Duplicate Detection

RadditDownloader uses perceptual hashing (pHash) to detect duplicate and similar media files.

### Finding Duplicates

**CLI Commands:**

```bash
# Find duplicates with default threshold (85% similarity)
npm run web -- --find-duplicates

# Find duplicates with custom threshold (lower = less strict)
npm run web -- --find-duplicates=70

# Generate phashes for existing downloads
npm run web -- --generate-phash
```

**Web API:**

```bash
# Get duplicates via API
GET http://localhost:3000/api/duplicates?threshold=85


# Trigger background phash generation
POST http://localhost:3000/api/duplicates/generate

# Delete a duplicate file
DELETE http://localhost:3000/api/duplicates/:id
```

### How It Works

**For Images:**

- Generates a single 64-bit perceptual hash per image
- Hash is invariant to resizing, compression, and minor edits
- Hamming distance used to compare similarity

**For Videos:**

- Extracts 5 frames at 10%, 30%, 50%, 70%, and 90% of video duration
- Generates phash for each frame
- Uses voting system: duplicates if 3+ frames match (60% confidence)

## Development

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)

### 1. Clone the Repository

```bash
git clone https://github.com/srad/raddit-downloader.git
cd raddit-downloader
```

### 2. Install Dependencies

Install all project dependencies (including devDependencies for Electron and testing):

```bash
npm install
```

### 3. Run in Development Mode

You can run the application in different modes during development:

**CLI Mode (Interactive):**

```bash
npm start
```

**Web Interface:**
Starts the backend server and web UI at `http://localhost:3000`.

```bash
npm run web
```

**Desktop App (Electron):**
Builds the frontend and launches the Electron desktop application.

```bash
npm run desktop
```

### 4. Build and Package

This project uses [Electron Forge](https://www.electronforge.io/) to package the application.

**Create Distributables:**
This command compiles the TypeScript code, builds the Vue frontend, and packages the app for your current platform (e.g., `.exe` for Windows, `.deb`/`.rpm` for Linux).

```bash
npm run make
```

The output files will be located in the `out/` directory:

- **Windows:** `out/make/squirrel.windows/x64/`
- **Linux:** `out/make/deb/x64/` or `out/make/rpm/x64/`

### Running Tests

```bash
npm test                          # Run all tests
npm test -- --selectProjects=unit # Unit tests only
npm test -- --selectProjects=e2e  # E2E tests only
npm run test:watch               # Watch mode
npm run test:coverage            # Coverage report
```

### Packaging for Distribution

Use Electron Forge to create platform-specific distributables (exe, deb, rpm, zip):

```bash
npm run make
```

### Adding a New Downloader

1. Implement the `Downloader` interface in `src/services/download/`
2. Register in `src/services/download/index.ts`
3. Add tests in `__tests__/`

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

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

[MIT License](LICENSE)

## Credits

Original project by [Joseph R. Cox](https://github.com/josephrcox/easy-reddit-downloader)
This fork by [srad](https://github.com/srad)
