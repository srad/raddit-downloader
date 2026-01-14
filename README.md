# Raddit Downloader

Reddit content downloader for specific subs or profiles with a CLI, web, and desktop frontend interface.

This project is a fork from https://github.com/josephrcox/easy-reddit-downloader and a heavy rewrite of the original code, with mode tests and patterns.

This app makes it simpler to gather, for example, training data for AI models.

## Features

- **Download Anything:** Supports images (jpg, png, gif), videos (mp4), text posts (txt), and link posts (html redirects).
- **Customizable:** Configure file naming, download directories, sorting, time periods, and more.
- **Bulk Download:** Download from multiple subreddits or users at once.
- **Post List:** Download a specific list of posts from a text file.
- **Smart Handling:** Automatically handles Gallery posts, Reddit hosted videos, Imgur links, and Gfycat/Redgifs.
- **Safe & Clean:** Option to separate NSFW content from clean content.
- **Type Safe:** Fully typed codebase for better maintenance and fewer bugs.

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

A `user_config.json` file will be created on first run. You can edit this file to customize:

- `file_naming_scheme`: Choose what info is in the filename (date, score, author, etc.)
- `download_post_list_options`: Settings for downloading from `download_post_list.txt`
- `separate_clean_nsfw`: Sort downloads into 'clean' and 'nsfw' folders
- `redownload_posts`: Whether to skip already downloaded files
- And much more!

### Testing Mode

You can enable `testingMode` in `user_config.json` to skip prompts and use the settings defined in `testingModeOptions`.

## Development

### Running Tests

Run unit and end-to-end tests with:

```bash
npm test
```

### Project Structure

- `src/`: Source code
    - `index.ts`: Entry point
    - `services/`: Core logic (API, Config, Logger, FileSystem, State)
    - `services/download/`: Downloader strategies
    - `utils/`: Utility functions and prompts
    - `config/`: Constants
    - `types/`: TypeScript interfaces
- `dist/`: Compiled JavaScript output
- `__tests__/`: Unit and E2E tests

## License

MIT