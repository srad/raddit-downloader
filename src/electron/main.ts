import 'reflect-metadata';
import { app, BrowserWindow } from 'electron';
import { WebRunner } from '../runners/WebRunner';

let serverStarted = false;

async function startServer() {
  if (!serverStarted) {
    const webRunner = new WebRunner();
    await webRunner.run({ openBrowser: false });
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
  win.loadURL('http://localhost:3000');
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
