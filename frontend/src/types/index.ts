export interface FileItem {
  id: string | number;
  filename: string;
  size?: number;
  source: string;
  thumbnail?: string;
  path: string;
  url: string;
  isDirectory?: boolean;
}
