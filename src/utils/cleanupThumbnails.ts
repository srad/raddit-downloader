/**
 * Utility script to clean up orphaned thumbnails
 * (thumbnails whose original files no longer exist)
 *
 * Run with: npm run cleanup-thumbnails
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import * as path from 'path';
import { ThumbnailService } from '../services/ThumbnailService';
import { FileSystemService } from '../services/FileSystemService';
import { LoggerService } from '../services/LoggerService';
import { DATA_DIR } from '../config/constants';

async function main() {
    console.log('Orphaned Thumbnail Cleanup Utility');
    console.log('===================================\n');

    // Register services in container
    const fsService = container.resolve(FileSystemService);
    const loggerService = container.resolve(LoggerService);
    const thumbnailService = container.resolve(ThumbnailService);

    await thumbnailService.initialize();

    const downloadsDir = path.join(DATA_DIR, 'downloads');

    console.log(`Scanning downloads directory: ${downloadsDir}`);
    console.log('Looking for orphaned thumbnails...\n');

    const deletedCount = await thumbnailService.cleanupOrphanedThumbnails(downloadsDir);

    console.log(`\n✓ Cleanup complete!`);
    console.log(`  Removed ${deletedCount} orphaned thumbnail(s)`);

    if (deletedCount > 0) {
        console.log('\nDisk space has been freed up.');
    } else {
        console.log('\nNo orphaned thumbnails found. Your thumbnail directory is clean!');
    }
}

main().catch(console.error);
