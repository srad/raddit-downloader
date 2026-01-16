import { DownloadRecord } from '../services/DatabaseService';

export interface DuplicateGroup {
  files: DownloadRecord[];
  avgDistance: number;
  confidence?: number;  // For video comparisons (0-1)
  matchingFrames?: number;  // For video comparisons
  type: 'image' | 'video' | 'mixed';
}

export interface DuplicateDetectionResult {
  groups: DuplicateGroup[];
  totalGroups: number;
  totalDuplicates: number;
}
