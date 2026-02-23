import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import sharpPhash from 'sharp-phash';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeStatic = require('ffprobe-static');
import { LoggerService } from './LoggerService';
import { FileSystemService } from './FileSystemService';
import { DatabaseService, DownloadRecord } from './DatabaseService';
import { DuplicateGroup, DuplicateDetectionResult } from '../types/phash';
import { injectable, inject } from 'tsyringe';

export interface ComparisonResult {
  match: boolean;
  distance: number;
  confidence?: number;  // For video comparisons (0-1)
  matchingFrames?: number;  // For video comparisons
}

@injectable()
export class PhashService {
  constructor(
    @inject(LoggerService) private loggerService: LoggerService,
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(DatabaseService) private dbService: DatabaseService
  ) {}

  /**
   * Generate perceptual hash for an image file
   * @param filePath Full path to the image file
   * @returns Hexadecimal hash string
   */
  async generatePhashForImage(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath);
      const hash = await sharpPhash(buffer);
      return hash;
    } catch (error: any) {
      this.loggerService.log(`Failed to generate phash for image ${filePath}: ${error.message}`, true);
      throw error;
    }
  }

  /**
   * Get video duration in seconds using ffprobe
   * @param filePath Full path to video file
   * @returns Duration in seconds
   */
  private async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!ffmpegPath) {
        reject(new Error('ffmpeg binary not found'));
        return;
      }

      // Use ffprobe (bundled with ffmpeg-static) to get duration
      const ffprobePath = ffprobeStatic.path;

      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ];

      const ffprobeProcess = spawn(ffprobePath, args);
      let stdout = '';
      let stderr = '';

      ffprobeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobeProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
          return;
        }

        const duration = parseFloat(stdout.trim());
        if (isNaN(duration) || duration <= 0) {
          reject(new Error(`Invalid duration: ${stdout}`));
          return;
        }

        resolve(duration);
      });

      ffprobeProcess.on('error', (err) => {
        reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
      });
    });
  }

  /**
   * Extract a single frame from video at specified time
   * @param filePath Full path to video file
   * @param timeSeconds Time to extract frame (in seconds)
   * @returns Path to temporary PNG file
   */
  private async extractFrame(filePath: string, timeSeconds: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!ffmpegPath) {
        reject(new Error('ffmpeg binary not found'));
        return;
      }

      const tempFilename = `phash_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
      const tempPngPath = path.join(path.dirname(filePath), tempFilename);

      // Format time as HH:MM:SS.mmm
      const hours = Math.floor(timeSeconds / 3600);
      const minutes = Math.floor((timeSeconds % 3600) / 60);
      const seconds = timeSeconds % 60;
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;

      const args = [
        '-ss', timeStr,
        '-i', filePath,
        '-vframes', '1',
        '-q:v', '2',  // High quality
        '-y',
        tempPngPath
      ];

      const ffmpegProcess = spawn(ffmpegPath, args);
      let stderrOutput = '';

      ffmpegProcess.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      ffmpegProcess.on('close', async (code) => {
        if (code !== 0) {
          await fs.unlink(tempPngPath).catch(() => {});
          reject(new Error(`ffmpeg exited with code ${code}: ${stderrOutput.slice(-200)}`));
          return;
        }

        // Verify file was created
        try {
          await fs.access(tempPngPath);
          resolve(tempPngPath);
        } catch {
          reject(new Error('Frame extraction failed: output file not created'));
        }
      });

      ffmpegProcess.on('error', async (err) => {
        await fs.unlink(tempPngPath).catch(() => {});
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
      });
    });
  }
  /**
   * Generate array of 5 perceptual hashes for video (multi-frame sampling)
   * Extracts frames at 10%, 30%, 50%, 70%, 90% of video duration
   * @param filePath Full path to video file
   * @returns Array of 5 hexadecimal hash strings
   */
  async generatePhashForVideo(filePath: string): Promise<string[]> {
    try {
      // Get video duration
      const duration = await this.getVideoDuration(filePath);

      // Handle very short videos (< 1 second)
      if (duration < 1) {
        this.loggerService.log(`Video ${path.basename(filePath)} is very short (${duration}s), extracting single frame`, true);
        const frame = await this.extractFrame(filePath, duration / 2);
        const hash = await this.generatePhashForImage(frame);
        await fs.unlink(frame).catch(() => {});
        // Return single hash repeated 5 times for consistency
        return [hash, hash, hash, hash, hash];
      }

      // Calculate frame extraction times (10%, 30%, 50%, 70%, 90%)
      const percentages = [0.1, 0.3, 0.5, 0.7, 0.9];
      const times = percentages.map(p => duration * p);

      this.loggerService.log(`Extracting 5 frames from video ${path.basename(filePath)} (duration: ${duration.toFixed(1)}s)`, true);

      // Extract frames and generate hashes
      const hashes: string[] = [];
      for (let i = 0; i < times.length; i++) {
        try {
          const tempPng = await this.extractFrame(filePath, times[i]);
          const hash = await this.generatePhashForImage(tempPng);
          hashes.push(hash);
          await fs.unlink(tempPng).catch(() => {}); // Cleanup temp file

          this.loggerService.log(`  Frame ${i + 1}/5 at ${(percentages[i] * 100).toFixed(0)}%: ${hash.substring(0, 8)}...`, true);
        } catch (error: any) {
          this.loggerService.log(`  Failed to extract frame ${i + 1}/5: ${error.message}`, true);
          throw error;
        }
      }

      return hashes;
    } catch (error: any) {
      this.loggerService.log(`Failed to generate phash for video ${filePath}: ${error.message}`, true);
      throw error;
    }
  }

  /**
   * Main entry point for phash generation
   * Auto-detects file type and generates appropriate phash
   * @param filePath Full path to media file
   * @returns Single hash string for images, array of 5 hashes for videos, null on error
   */
  async generatePhash(filePath: string): Promise<string | string[] | null> {
    try {
      const ext = path.extname(filePath).toLowerCase();

      // Check if video file
      const videoExtensions = ['.mp4', '.webm', '.gifv', '.mov', '.avi', '.mkv'];
      const isVideo = videoExtensions.includes(ext);

      if (isVideo) {
        return await this.generatePhashForVideo(filePath);
      } else {
        return await this.generatePhashForImage(filePath);
      }
    } catch (error: any) {
      this.loggerService.log(`WARNING: Could not generate phash for ${path.basename(filePath)}: ${error.message}`, true);
      return null;
    }
  }

  /**
   * Calculate Hamming distance between two hash strings
   * Hamming distance is the number of differing bits between two hashes
   * @param hash1 First hash (hexadecimal string)
   * @param hash2 Second hash (hexadecimal string)
   * @returns Number of differing bits (0-64 for 64-bit hash)
   */
  hammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return 999; // Incompatible hashes
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
      // Count set bits in XOR result (Brian Kernighan's algorithm)
      let bits = xor;
      while (bits > 0) {
        distance++;
        bits &= bits - 1;
      }
    }
    return distance;
  }
  /**
   * Compare two phashes (handles both image and video phashes)
   * For videos, uses voting system: match if 3+ out of 5 frames match
   * @param phash1 First phash (string for image, array for video)
   * @param phash2 Second phash (string for image, array for video)
   * @param threshold Hamming distance threshold (default: 5 bits)
   * @returns Comparison result with match status and distance
   */
  comparePhashes(
    phash1: string | string[],
    phash2: string | string[],
    threshold: number = 5
  ): ComparisonResult {
    // Image vs Image
    if (typeof phash1 === 'string' && typeof phash2 === 'string') {
      const distance = this.hammingDistance(phash1, phash2);
      return {
        match: distance <= threshold,
        distance: distance
      };
    }

    // Video vs Video (multi-frame voting)
    if (Array.isArray(phash1) && Array.isArray(phash2)) {
      if (phash1.length !== 5 || phash2.length !== 5) {
        return { match: false, distance: 999 };
      }

      let matchingFrames = 0;
      let totalDistance = 0;

      for (let i = 0; i < 5; i++) {
        const distance = this.hammingDistance(phash1[i], phash2[i]);
        totalDistance += distance;
        if (distance <= threshold) {
          matchingFrames++;
        }
      }

      const avgDistance = totalDistance / 5;
      const confidence = matchingFrames / 5;

      return {
        match: matchingFrames >= 3,  // 60% voting threshold
        distance: Math.round(avgDistance),
        confidence: confidence,
        matchingFrames: matchingFrames
      };
    }

    // Image vs Video (incompatible)
    return {
      match: false,
      distance: 999
    };
  }

  /**
   * Find a single duplicate in the database for a given phash
   * @param phash Phash to check
   * @param threshold Hamming distance threshold
   * @param pathPrefix Optional path prefix to restrict search
   * @returns The matching record if found, null otherwise
   */
  async findDuplicate(
    phash: string | string[],
    threshold: number = 5,
    pathPrefix?: string
  ): Promise<DownloadRecord | null> {
    const records = await this.dbService.getDownloads({ hasPhash: true, pathPrefix });
    
    for (const record of records) {
      try {
        const existingPhash = record.phash!.startsWith('[')
          ? JSON.parse(record.phash!) as string[]
          : record.phash!;
        
        const result = this.comparePhashes(phash, existingPhash, threshold);
        if (result.match) {
          return record;
        }
      } catch (e) {
        continue;
      }
    }
    
    return null;
  }
  /**
   * Find all duplicate files based on perceptual hash similarity
   * @param threshold Hamming distance threshold (default: 5 bits)
   * @param signal AbortSignal to cancel the operation
   * @param onProgress Callback for progress updates
   * @param pathPrefix Optional path prefix to filter by (e.g. folder name)
   * @returns Array of duplicate groups, sorted by group size
   */
  async findDuplicates(
    threshold: number = 5,
    signal?: AbortSignal,
    onProgress?: (processed: number, total: number) => void,
    pathPrefix?: string
  ): Promise<DuplicateDetectionResult> {
    const filterMsg = pathPrefix ? ` in ${pathPrefix}` : '';
    this.loggerService.log(`Searching for duplicates${filterMsg} (threshold: ${threshold} bits)...`, false);

    // Get records with phash, optionally filtered by path
    const records = await this.dbService.getDownloads({ hasPhash: true, pathPrefix });

    if (records.length === 0) {
      this.loggerService.log('No files with phash found in database', false);
      return { groups: [], totalGroups: 0, totalDuplicates: 0 };
    }

    this.loggerService.log(`Analyzing ${records.length} files...`, false);

    // Parse phashes (handle both string and JSON array formats)
    interface ParsedRecord {
      record: typeof records[0];
      phash: string | string[];
      isVideo: boolean;
    }

    const parsed: ParsedRecord[] = records
      .map(r => {
        try {
          const phash = r.phash!.startsWith('[')
            ? JSON.parse(r.phash!) as string[]
            : r.phash!;

          return {
            record: r,
            phash: phash,
            isVideo: Array.isArray(phash)
          };
        } catch (error) {
          this.loggerService.log(`Failed to parse phash for ${r.filename}: ${error}`, true);
          return null;
        }
      })
      .filter((p): p is ParsedRecord => p !== null);

    // Union-Find data structure for grouping duplicates
    const parent = new Map<number, number>();
    const rank = new Map<number, number>();

    function find(x: number): number {
      if (!parent.has(x)) {
        parent.set(x, x);
        rank.set(x, 0);
      }
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)!));
      }
      return parent.get(x)!;
    }

    function union(x: number, y: number): void {
      const rootX = find(x);
      const rootY = find(y);

      if (rootX === rootY) return;

      const rankX = rank.get(rootX) || 0;
      const rankY = rank.get(rootY) || 0;

      if (rankX < rankY) {
        parent.set(rootX, rootY);
      } else if (rankX > rankY) {
        parent.set(rootY, rootX);
      } else {
        parent.set(rootY, rootX);
        rank.set(rootX, rankX + 1);
      }
    }

    // Compare all pairs and group duplicates
    let comparisons = 0;
    const totalComparisons = (parsed.length * (parsed.length - 1)) / 2;

    for (let i = 0; i < parsed.length; i++) {
      // Check cancellation periodically
      if (i % 50 === 0) { // Check every 50 outer iterations
        if (signal?.aborted) {
          throw new Error('Duplicate scan cancelled');
        }
        // Yield to event loop to keep server responsive
        await new Promise(resolve => setImmediate(resolve));
      }

      for (let j = i + 1; j < parsed.length; j++) {
        comparisons++;
        
        // Report progress every 1000 comparisons (but don't log to console)
        if (comparisons % 1000 === 0 && onProgress) {
          onProgress(comparisons, totalComparisons);
        }

        const result = this.comparePhashes(parsed[i].phash, parsed[j].phash, threshold);

        if (result.match) {
          union(i, j);
        }
      }
    }

    // Group records by their root parent
    const groupsMap = new Map<number, number[]>();
    for (let i = 0; i < parsed.length; i++) {
      const root = find(i);
      if (!groupsMap.has(root)) {
        groupsMap.set(root, []);
      }
      groupsMap.get(root)!.push(i);
    }

    // Filter out singleton groups and build result
    const groups: DuplicateGroup[] = Array.from(groupsMap.values())
      .filter(group => group.length > 1)
      .map(group => {
        const groupRecords = group.map(i => parsed[i].record);

        // Calculate average distance within group
        let totalDistance = 0;
        let totalConfidence = 0;
        let videoComparisons = 0;
        let comparisons = 0;

        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const result = this.comparePhashes(
              parsed[group[i]].phash,
              parsed[group[j]].phash,
              threshold
            );
            totalDistance += result.distance;
            comparisons++;

            if (result.confidence !== undefined) {
              totalConfidence += result.confidence;
              videoComparisons++;
            }
          }
        }

        const avgDistance = comparisons > 0 ? totalDistance / comparisons : 0;
        const avgConfidence = videoComparisons > 0 ? totalConfidence / videoComparisons : undefined;

        // Determine group type
        const hasVideo = group.some(i => parsed[i].isVideo);
        const hasImage = group.some(i => !parsed[i].isVideo);
        const type: 'image' | 'video' | 'mixed' = hasVideo && hasImage ? 'mixed' : hasVideo ? 'video' : 'image';

        return {
          files: groupRecords,
          avgDistance: Math.round(avgDistance * 10) / 10,
          confidence: avgConfidence,
          type: type
        };
      })
      .sort((a, b) => b.files.length - a.files.length); // Largest groups first

    const totalDuplicates = groups.reduce((sum, g) => sum + g.files.length, 0);

    this.loggerService.log(`Found ${groups.length} duplicate groups (${totalDuplicates} files)`, false);

    return {
      groups: groups,
      totalGroups: groups.length,
      totalDuplicates: totalDuplicates
    };
  }

  /**
   * Check if file is a video based on extension
   * @param filePath File path to check
   * @returns True if file is a video
   */
  private isVideoFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.mp4', '.webm', '.gifv', '.mov', '.avi', '.mkv'].includes(ext);
  }

  /**
   * Check if file is an image based on extension
   * @param filePath File path to check
   * @returns True if file is an image
   */
  private isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
  }
}
