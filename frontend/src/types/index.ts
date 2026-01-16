export interface FileItem {
  id: number;
  filename: string;
  size?: number;
  source?: string;
  thumbnail?: string | null;
  path: string;
  url?: string;
  isDirectory?: boolean;
  fileCount?: number;
}
