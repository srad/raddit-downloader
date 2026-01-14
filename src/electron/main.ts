import 'reflect-metadata';
import { app, BrowserWindow } from 'electron';
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
