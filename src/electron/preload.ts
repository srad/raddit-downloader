/**
 * Preload script for Electron
 * Exposes safe APIs to the renderer process via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';

// Extract app version from additionalArguments
const versionArg = process.argv.find(arg => arg.startsWith('--app-version='));
const appVersion = versionArg ? versionArg.split('=')[1] : process.env.APP_VERSION || '';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: (path: string) => ipcRenderer.invoke('open-folder', path),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowStateChange: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('window-state-change', (_event, isMaximized) => callback(isMaximized));
  },
  version: appVersion
});

contextBridge.exposeInMainWorld('version', appVersion);

contextBridge.exposeInMainWorld('backend', {
  port: process.env.BACKEND_PORT,
});
