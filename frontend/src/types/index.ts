export interface FileItem {
  id: number;
  filename: string;
  size: number;
  source?: string;
  thumbnail: string | null;
  path: string;
  url?: string;
  isDirectory?: boolean;
  fileCount?: number;
}

declare global {
  interface Window {
    version: string;
    electronAPI?: {
      openFolder: (path: string) => Promise<{ success: boolean; error?: string }>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onWindowStateChange: (callback: (isMaximized: boolean) => void) => void;
      version?: string;
    };
    backend?: {
      port: string | number;
    };
  }
}