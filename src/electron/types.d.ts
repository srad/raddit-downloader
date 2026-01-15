/**
 * Type definitions for Electron APIs exposed to renderer
 */

export interface ElectronAPI {
  openFolder: (path: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
