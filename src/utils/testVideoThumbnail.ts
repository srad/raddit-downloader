/**
 * Test utility to check video thumbnail generation
 * Run with: ts-node src/utils/testVideoThumbnail.ts <path-to-video>
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import * as path from 'path';
import { ThumbnailService } from '../services/ThumbnailService';
import { FileSystemService } from '../services/FileSystemService';
import { LoggerService } from '../services/LoggerService';
import { DATA_DIR } from '../config/constants';

async function main() {
    const videoPath = process.argv[2];

    if (!videoPath) {
        console.error('Usage: ts-node src/utils/testVideoThumbnail.ts <path-to-video>');
        process.exit(1);
    }

    console.log('Testing video thumbnail generation...');
    console.log(`Video: ${videoPath}`);
    console.log(`Thumbnail dir: ${path.join(DATA_DIR, 'thumbnails')}\n`);

    const fsService = container.resolve(FileSystemService);
    const loggerService = container.resolve(LoggerService);
    const thumbnailService = container.resolve(ThumbnailService);

    await thumbnailService.initialize();

    // Generate relative path for testing
    const relativePath = `test/${path.basename(videoPath)}`;

    console.log('Attempting to generate thumbnail...\n');

    const result = await thumbnailService.generateThumbnail(videoPath, relativePath, false);

    if (result) {
        console.log(`\n✓ SUCCESS! Thumbnail generated at: ${result}`);
        console.log(`Full path: ${path.join(DATA_DIR, 'thumbnails', result)}`);
    } else {
        console.log('\n✗ FAILED - No thumbnail generated');
        console.log('Check the error messages above for details');
    }
}

main().catch(err => {
    console.error('\n✗ FATAL ERROR:', err);
    process.exit(1);
});
