const { version } = require('./package.json');

module.exports = {
    packagerConfig: {
        asar: false, // Keep FALSE to see errors
        ignore: [
            /^\/data/,
            /^\/out/,
            /^\/src/,
            /^\/\.git/,
            /^\/__tests__/,
            /\/nul$/
        ]
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                // Squirrel needs these explicitly to avoid the FileStream error
                authors: 'srad',
                description: 'A Reddit post downloader and gallery viewer.',
                name: 'radditdownloader', // Keep this lowercase, no spaces,
                setupExe: `RadditDownloader-${version}-Installer.exe`
            },
        },
        {
            // We add 'win32' here so you get a simple ZIP file too
            // This is much faster to debug than the Setup.exe
            name: '@electron-forge/maker-zip',
            platforms: ['darwin', 'win32'],
        },
        {
            name: '@electron-forge/maker-deb',
            config: {},
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {},
        },
    ],
    plugins: [
        // Plugins commented out as per your setup
    ],
};