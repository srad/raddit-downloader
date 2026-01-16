if (require('electron-squirrel-startup')) {
    require('electron').app.quit();
    process.exit(0); // Exit immediately
}

import 'reflect-metadata';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { WebRunner as WebRunnerType } from '../runners/WebRunner';
import * as path from 'path';
import * as fs from 'fs';

let serverStarted = false;
let webRunner: WebRunnerType | null = null;

async function startServer() {
  if (!serverStarted) {
    // Set DATA_DIR to a writable location in userData
    const userDataPath = app.getPath('userData');
    const dataPath = path.join(userDataPath, 'data');
    
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
    
    process.env.DATA_DIR = dataPath;
    console.log(`DATA_DIR set to: ${process.env.DATA_DIR}`);

    // Dynamically import WebRunner to ensure it uses the new DATA_DIR env var
    const { WebRunner } = await import('../runners/WebRunner');
    
    webRunner = new WebRunner();
    // Pass port: 0 to let the OS assign an available port
    await webRunner.run({ openBrowser: false, port: 0 });
    serverStarted = true;

    process.env.BACKEND_PORT = String(webRunner.getPort());
  }
}

async function createWindow() {
  // Read version directly from package.json
  const packageJsonPath = path.join(__dirname, '../../package.json');
  let appVersion = '';
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    appVersion = packageJson.version;
  } catch (err) {
    console.error('Failed to read package.json version:', err);
  }
  
  console.log(`Starting app version: ${appVersion}`);
  
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Frameless window
    titleBarStyle: 'hidden', // Required for custom title bar on some platforms
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--app-version=${appVersion}`]
    },
  });

  win.setMenu(null);

  // IPC handlers for window controls
  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', () => win.close());
  ipcMain.handle('window-is-maximized', () => win.isMaximized());

  win.on('maximize', () => win.webContents.send('window-state-change', true));
  win.on('unmaximize', () => win.webContents.send('window-state-change', false));

  // Redirect renderer console to main process console
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const levelStr = levels[level] || 'INFO';
    console.log(`[Renderer][${levelStr}] ${message} (at ${sourceId}:${line})`);
  });

  const vueIndexPath = path.join(__dirname, '../../public/index.html');
  await win.loadFile(vueIndexPath);

  // Handle status changes
  if (webRunner) {
    webRunner.on('status-change', (status: string) => {
      if (status === 'running') {
        win.setTitle('Raddit Downloader - Downloading...');
      } else {
        win.setTitle('Raddit Downloader');
      }
    });
  }

  // Prevent accidental close during download
  win.on('close', (e) => {
    if (webRunner && webRunner.getStatus()) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Confirm',
        message: 'A download is currently in progress. Are you sure you want to quit?'
      });

      if (choice === 1) {
        e.preventDefault();
      }
    }
  });
}

// IPC handler for opening folders
ipcMain.handle('open-folder', async (event, folderPath: string) => {
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    console.error('Failed to open folder:', error);
    return { success: false, error: String(error) };
  }
});

app.whenReady().then(async () => {
  process.env.APP_VERSION = app.getVersion();
  await startServer();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
