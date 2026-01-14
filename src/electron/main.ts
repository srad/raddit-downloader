import 'reflect-metadata';
import { app, BrowserWindow, dialog } from 'electron';
import { WebRunner } from '../runners/WebRunner';

let serverStarted = false;
let webRunner: WebRunner | null = null;

async function startServer() {
  if (!serverStarted) {
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
