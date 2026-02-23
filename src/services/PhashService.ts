import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeStatic = require('ffprobe-static');
import { LoggerService } from './LoggerService';
import { FileSystemService } from './FileSystemService';
import { DatabaseService, DownloadRecord } from './DatabaseService';
import { DuplicateGroup, DuplicateDetectionResult } from '../types/phash';
import { injectable, inject } from 'tsyringe';
import { FileUtils } from '../utils/fileUtils';

export interface ComparisonResult {
  match: boolean;
  score: number; // 0-100 similarity
  confidence?: number; // For video comparisons (0-1)
  matchingFrames?: number; // For video comparisons
}

// Helper for DCT (Discrete Cosine Transform)
function dct(signal: number[]): number[] {
  const L = signal.length;
  const coefficients = new Array(L).fill(0);
  for (let u = 0; u < L; u++) {
    let sum = 0;
    for (let x = 0; x < L; x++) {
      sum += signal[x] * Math.cos((Math.PI * u * (2 * x + 1)) / (2 * L));
    }
    const alpha = u === 0 ? Math.sqrt(1 / L) : Math.sqrt(2 / L);
    coefficients[u] = alpha * sum;
  }
  return coefficients;
}

@injectable()
export class PhashService {
  constructor(
    @inject(LoggerService) private loggerService: LoggerService,
    @inject(FileSystemService) private fsService: FileSystemService,
    @inject(DatabaseService) private dbService: DatabaseService,
  ) {}

  /**
   * Generate high-resolution hybrid (structure + color) hash for an image file
   * @param filePath Full path to the image file
   * @returns Versioned hybrid hash string (v2:STRUCT_HEX:COLOR_B64)
   */
  async generatePhashForImage(filePath: string): Promise<string> {
    try {
      const image = sharp(filePath);
      const [structHash, colorHash] = await Promise.all([
        this.generateStructuralHash(image),
        this.generateColorHash(image),
      ]);
      return `v2:${structHash}:${colorHash}`;
    } catch (error: any) {
      this.loggerService.log(`Failed to generate phash for image ${filePath}: ${error.message}`, true);
      throw error;
    }
  }

  /**
   * Generate a 256-bit structural hash using 16x16 DCT coefficients
   */
  private async generateStructuralHash(image: sharp.Sharp): Promise<string> {
    const size = 16;
    const dctSize = 32;
    const data = await image.clone().resize(dctSize, dctSize, { fit: 'fill' }).grayscale().raw().toBuffer();

    const matrix: number[][] = [];
    for (let y = 0; y < dctSize; y++) {
      matrix[y] = [];
      for (let x = 0; x < dctSize; x++) {
        matrix[y][x] = data[y * dctSize + x];
      }
    }

    // 2D DCT
    const rows = matrix.map((row) => dct(row));
    const cols: number[][] = [];
    for (let x = 0; x < dctSize; x++) {
      const col = rows.map((r) => r[x]);
      cols[x] = dct(col);
    }

    // Take top-left 16x16
    const flat: number[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        flat.push(cols[x][y]);
      }
    }

    const sorted = [...flat].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    let hex = '';
    for (let i = 0; i < flat.length; i += 4) {
      let chunk = 0;
      for (let j = 0; j < 4 && i + j < flat.length; j++) {
        if (flat[i + j] > median) {
          chunk |= 1 << j;
        }
      }
      hex += chunk.toString(16);
    }
    return hex;
  }

  /**
   * Generate a 4x4 RGB grid hash (48 values)
   */
  private async generateColorHash(image: sharp.Sharp): Promise<string> {
    const data = await image.clone().resize(4, 4, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    return data.toString('base64');
  }

  /**
   * Get video duration in seconds using ffprobe
   */
  private async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!ffmpegPath) {
        reject(new Error('ffmpeg binary not found'));
        return;
      }
      const ffprobePath = ffprobeStatic.path;
      const args = [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
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
   */
  private async extractFrame(filePath: string, timeSeconds: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!ffmpegPath) {
        reject(new Error('ffmpeg binary not found'));
        return;
      }
      const tempFilename = `phash_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
      const tempPngPath = path.join(path.dirname(filePath), tempFilename);
      const hours = Math.floor(timeSeconds / 3600);
      const minutes = Math.floor((timeSeconds % 3600) / 60);
      const seconds = timeSeconds % 60;
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
      const args = ['-ss', timeStr, '-i', filePath, '-vframes', '1', '-q:v', '2', '-y', tempPngPath];
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
   * Generate array of 5 perceptual hashes for video
   */
  async generatePhashForVideo(filePath: string): Promise<string[]> {
    try {
      const duration = await this.getVideoDuration(filePath);
      if (duration < 1) {
        const frame = await this.extractFrame(filePath, duration / 2);
        const hash = await this.generatePhashForImage(frame);
        await fs.unlink(frame).catch(() => {});
        return [hash, hash, hash, hash, hash];
      }
      const percentages = [0.1, 0.3, 0.5, 0.7, 0.9];
      const times = percentages.map((p) => duration * p);
      const hashes: string[] = [];
      for (let i = 0; i < times.length; i++) {
        try {
          const tempPng = await this.extractFrame(filePath, times[i]);
          const hash = await this.generatePhashForImage(tempPng);
          hashes.push(hash);
          await fs.unlink(tempPng).catch(() => {});
        } catch (error: any) {
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
   * Auto-detects file type and generates hybrid phash
   */
  async generatePhash(filePath: string): Promise<string | string[] | null> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const videoExtensions = ['.mp4', '.webm', '.gifv', '.mov', '.avi', '.mkv'];
      if (videoExtensions.includes(ext)) return await this.generatePhashForVideo(filePath);
      return await this.generatePhashForImage(filePath);
    } catch (error: any) {
      this.loggerService.log(
        `WARNING: Could not generate phash for ${path.basename(filePath)}: ${error.message}`,
        true,
      );
      return null;
    }
  }

  /**
   * Calculate Hamming distance between two hex strings
   */
  private getHammingDistance(h1: string, h2: string): number {
    let distance = 0;
    const len = Math.min(h1.length, h2.length);
    for (let i = 0; i < len; i++) {
      let xor = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
      while (xor > 0) {
        distance++;
        xor &= xor - 1;
      }
    }
    return distance + Math.abs(h1.length - h2.length) * 4;
  }

  /**
   * Calculate similarity between two color grids (0 to 1)
   */
  private getColorSimilarity(c1: string, c2: string): number {
    try {
      const b1 = Buffer.from(c1, 'base64');
      const b2 = Buffer.from(c2, 'base64');
      if (b1.length !== b2.length || b1.length === 0) return 0;
      let sumSquaredDiff = 0;
      for (let i = 0; i < b1.length; i++) sumSquaredDiff += Math.pow(b1[i] - b2[i], 2);
      const maxDistance = Math.sqrt(b1.length * Math.pow(255, 2));
      const distance = Math.sqrt(sumSquaredDiff);
      return 1 - distance / maxDistance;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Compare two phashes (handles both image and video phashes)
   * threshold: 0-100 (similarity percentage)
   */
  comparePhashes(phash1: string | string[], phash2: string | string[], threshold: number = 85): ComparisonResult {
    const compareOne = (p1: string, p2: string): number => {
      if (p1.startsWith('v2:') && p2.startsWith('v2:')) {
        const [, s1, c1] = p1.split(':');
        const [, s2, c2] = p2.split(':');
        const sDist = this.getHammingDistance(s1, s2);
        const sSim = 1 - sDist / 256;
        const cSim = this.getColorSimilarity(c1, c2);
        return (sSim * 0.7 + cSim * 0.3) * 100;
      }
      // Fallback for v1 or mixed
      const clean1 = p1.startsWith('v2:') ? p1.split(':')[1].substring(0, 16) : p1;
      const clean2 = p2.startsWith('v2:') ? p2.split(':')[1].substring(0, 16) : p2;
      const dist = this.getHammingDistance(clean1, clean2);
      return (1 - dist / 64) * 100;
    };

    if (typeof phash1 === 'string' && typeof phash2 === 'string') {
      const score = compareOne(phash1, phash2);
      return { match: score >= threshold, score };
    }

    if (Array.isArray(phash1) && Array.isArray(phash2)) {
      if (phash1.length === 0 || phash2.length === 0) return { match: false, score: 0 };
      let matchingFrames = 0;
      let totalScore = 0;
      const count = Math.min(phash1.length, phash2.length);
      for (let i = 0; i < count; i++) {
        const score = compareOne(phash1[i], phash2[i]);
        totalScore += score;
        if (score >= threshold) matchingFrames++;
      }
      const avgScore = totalScore / count;
      return {
        match: matchingFrames >= Math.ceil(count * 0.6),
        score: avgScore,
        confidence: matchingFrames / count,
        matchingFrames,
      };
    }

    return { match: false, score: 0 };
  }

  async findDuplicate(
    phash: string | string[],
    threshold: number = 85,
    pathPrefix?: string,
  ): Promise<DownloadRecord | null> {
    const records = await this.dbService.getDownloads({ hasPhash: true, pathPrefix });
    for (const record of records) {
      try {
        const existingPhash = record.phash!.startsWith('[') ? (JSON.parse(record.phash!) as string[]) : record.phash!;
        if (this.comparePhashes(phash, existingPhash, threshold).match) return record;
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  async findDuplicates(
    threshold: number = 85,
    signal?: AbortSignal,
    onProgress?: (processed: number, total: number) => void,
    pathPrefix?: string,
  ): Promise<DuplicateDetectionResult> {
    const filterMsg = pathPrefix ? ` in ${pathPrefix}` : '';
    this.loggerService.log(`Searching for duplicates${filterMsg} (min similarity: ${threshold}%)...`, false);
    const records = await this.dbService.getDownloads({ hasPhash: true, pathPrefix });
    if (records.length === 0) return { groups: [], totalGroups: 0, totalDuplicates: 0 };

    interface ParsedRecord {
      record: DownloadRecord;
      phash: string | string[];
      isVideo: boolean;
    }
    const parsed: ParsedRecord[] = records
      .map((r) => {
        try {
          const phash = r.phash!.startsWith('[') ? (JSON.parse(r.phash!) as string[]) : r.phash!;
          return { record: r, phash, isVideo: Array.isArray(phash) };
        } catch (e) {
          return null;
        }
      })
      .filter((p): p is ParsedRecord => p !== null);

    const parent = new Map<number, number>();
    const find = (x: number): number => {
      if (!parent.has(x)) parent.set(x, x);
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
      return parent.get(x)!;
    };
    const union = (x: number, y: number) => {
      const rootX = find(x);
      const rootY = find(y);
      if (rootX !== rootY) parent.set(rootX, rootY);
    };

    let comparisons = 0;
    const totalComparisons = (parsed.length * (parsed.length - 1)) / 2;
    for (let i = 0; i < parsed.length; i++) {
      if (i % 50 === 0) {
        if (signal?.aborted) throw new Error('Duplicate scan cancelled');
        await new Promise((res) => setImmediate(res));
      }
      for (let j = i + 1; j < parsed.length; j++) {
        comparisons++;
        if (comparisons % 1000 === 0 && onProgress) onProgress(comparisons, totalComparisons);
        if (this.comparePhashes(parsed[i].phash, parsed[j].phash, threshold).match) union(i, j);
      }
    }

    const groupsMap = new Map<number, number[]>();
    for (let i = 0; i < parsed.length; i++) {
      const root = find(i);
      if (!groupsMap.has(root)) groupsMap.set(root, []);
      groupsMap.get(root)!.push(i);
    }

    const groups: DuplicateGroup[] = Array.from(groupsMap.values())
      .filter((g) => g.length > 1)
      .map((g) => {
        let totalScore = 0;
        let comps = 0;
        for (let i = 0; i < g.length; i++) {
          for (let j = i + 1; j < g.length; j++) {
            totalScore += this.comparePhashes(parsed[g[i]].phash, parsed[g[j]].phash, threshold).score;
            comps++;
          }
        }
        const hasVideo = g.some((idx) => parsed[idx].isVideo);
        const type: 'video' | 'image' = hasVideo ? 'video' : 'image';
        return {
          files: g.map((idx) => parsed[idx].record),
          avgDistance: Math.round((totalScore / comps) * 10) / 10,
          type: type,
        };
      })
      .sort((a, b) => b.files.length - a.files.length);

    return { groups, totalGroups: groups.length, totalDuplicates: groups.reduce((s, g) => s + g.files.length, 0) };
  }
}
