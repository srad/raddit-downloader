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
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setMenu(null);
  
  const port = webRunner?.getPort() || 3000;
  win.loadURL(`http://localhost:${port}`);

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
  await startServer();
  createWindow();

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
