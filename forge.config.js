const { version } = require('./package.json');

const makers = [
  // Windows: Squirrel Installer
  {
    name: '@electron-forge/maker-squirrel',
    platforms: ['win32'],
    config: {
      authors: 'srad',
      description: 'A Reddit post downloader and gallery viewer.',
      name: 'radditdownloader',
      exe: 'raddit-downloader.exe',
      setupExe: `RadditDownloader-${version}-Installer.exe`
    },
  },
  // Multi-platform: Zip
  {
    name: '@electron-forge/maker-zip',
    platforms: ['darwin', 'win32', 'linux'],
  }
];

// Only load Linux makers when running on Linux to prevent load-time crashes on Windows/macOS
if (process.platform === 'linux') {
  makers.push(
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'srad',
          homepage: 'https://github.com/srad/raddit-downloader',
          categories: ['Utility', 'Network'],
          description: 'A Reddit content crawler with CLI, web, and desktop interface.',
          productName: 'RadditDownloader',
          genericName: 'Reddit Downloader'
        }
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'srad',
          homepage: 'https://github.com/srad/raddit-downloader',
          categories: ['Utility', 'Network'],
          description: 'A Reddit content crawler with CLI, web, and desktop interface.',
          productName: 'RadditDownloader',
          genericName: 'Reddit Downloader'
        }
      },
    },
    /*
    {
      name: 'electron-forge-maker-appimage',
      platforms: ['linux'],
      config: {
        options: {
          maintainer: 'srad',
          homepage: 'https://github.com/srad/raddit-downloader',
          categories: ['Utility', 'Network'],
          description: 'A Reddit content crawler with CLI, web, and desktop interface.',
          productName: 'RadditDownloader',
          genericName: 'Reddit Downloader'
        }
      },
    }
    */
  );
}

module.exports = {
  packagerConfig: {
    asar: false, // Keep FALSE to see errors during development
    icon: './frontend/assets/logo', // Icon path (omit extension to support .ico, .icns, .png)
    executableName: 'raddit-downloader',
    ignore: [
      /^\/data/,
      /^\/out/,
      /^\/src/,
      /^\/\.git/,
      /^\/\.github/,
      /^\/\.idea/,
      /^\/__tests__/,
      /\/nul$/
    ]
  },
  rebuildConfig: {},
  makers: makers,
  plugins: [
    // Plugins commented out as per your setup
  ],
};
