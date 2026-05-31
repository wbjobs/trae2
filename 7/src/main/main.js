const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createWindow } = require('./window');
const { setupIpc } = require('./ipc');
const logger = require('./logger');
const configManager = require('./config');

let mainWindow = null;

app.whenReady().then(() => {
  configManager.loadConfig();
  mainWindow = createWindow();
  setupIpc(mainWindow);
  logger.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      setupIpc(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  logger.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
