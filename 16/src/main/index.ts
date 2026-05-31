import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { localService } from './services/LocalService';

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development';

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Hardware Tuner',
    backgroundColor: '#1a1a2e',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(() => {
  const window = createWindow();
  localService.setMainWindow(window);
  localService.registerIPCHandlers();
  localService.setupDeviceEventForwarding();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      localService.setMainWindow(win);
    }
  });
});

app.on('window-all-closed', async () => {
  await localService.shutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await localService.shutdown();
});
