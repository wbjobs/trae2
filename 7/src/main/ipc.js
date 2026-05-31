const { ipcMain, dialog } = require('electron');
const logger = require('./logger');
const configManager = require('./config');

function setupIpc(mainWindow) {
  logger.on('log', (entry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log:new', entry);
    }
  });

  logger.on('logs:imported', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('logs:imported', info);
    }
  });

  logger.on('watch:started', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('watch:started', info);
    }
  });

  logger.on('watch:stopped', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('watch:stopped', info);
    }
  });

  logger.on('cleared', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log:cleared');
    }
  });

  ipcMain.handle('logs:fetch', () => {
    return logger.getLogs();
  });

  ipcMain.handle('logs:clear', () => {
    logger.clear();
    return true;
  });

  ipcMain.handle('logs:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择日志文件',
      properties: ['openFile', 'multiSelect'],
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled) return { canceled: true, count: 0 };
    let total = 0;
    for (const filePath of result.filePaths) {
      try {
        const res = await logger.ingestFile(filePath, false);
        total += res.count;
      } catch (err) {
        console.error('import error:', err);
      }
    }
    return { canceled: false, count: total, paths: result.filePaths };
  });

  ipcMain.handle('logs:watch', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择要监控的日志文件',
      properties: ['openFile', 'multiSelect'],
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled) return { canceled: true, count: 0 };
    let started = 0;
    for (const filePath of result.filePaths) {
      if (logger.watchFile(filePath)) {
        started++;
      }
    }
    return { canceled: false, started, paths: result.filePaths, watched: logger.getWatchedFiles() };
  });

  ipcMain.handle('logs:unwatch', (_event, filePath) => {
    return logger.unwatchFile(filePath);
  });

  ipcMain.handle('logs:getWatched', () => {
    return logger.getWatchedFiles();
  });

  ipcMain.handle('config:get', () => {
    return configManager.getConfig();
  });

  ipcMain.handle('config:save', (_event, partial) => {
    const ok = configManager.saveConfig(partial);
    if (ok && partial.maxLogs) {
      logger.maxLogs = partial.maxLogs;
    }
    return ok ? configManager.getConfig() : null;
  });

  ipcMain.handle('config:reset', () => {
    return configManager.resetConfig();
  });
}

module.exports = { setupIpc };
