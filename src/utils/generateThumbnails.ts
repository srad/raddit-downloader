/**
 * Utility script to generate thumbnails for existing downloaded files
 * Run with: ts-node src/utils/generateThumbnails.ts
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import * as path from 'path';
import { ThumbnailService } from '../services/ThumbnailService';
import { FileSystemService } from '../services/FileSystemService';
import { LoggerService } from '../services/LoggerService';
import { DATA_DIR } from '../config/constants';

async function main() {
    console.log('Starting thumbnail generation for existing files...\n');

    // Register services in container
    const fsService = container.resolve(FileSystemService);
    const loggerService = container.resolve(LoggerService);
    const thumbnailService = container.resolve(ThumbnailService);

    await thumbnailService.initialize();

    const downloadsDir = path.join(DATA_DIR, 'downloads');

    console.log(`Scanning directory: ${downloadsDir}`);
    console.log('This may take a while for large collections...\n');

    await thumbnailService.batchGenerateThumbnails(downloadsDir);

    console.log('\n✓ Thumbnail generation complete!');
    console.log('You can now use the web interface to view your media with fast-loading thumbnails.');
}

main().catch(console.error);
