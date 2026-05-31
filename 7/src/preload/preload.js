const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('logAPI', {
  fetchLogs: () => ipcRenderer.invoke('logs:fetch'),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  importLogs: () => ipcRenderer.invoke('logs:import'),
  watchLogs: () => ipcRenderer.invoke('logs:watch'),
  unwatchLog: (filePath) => ipcRenderer.invoke('logs:unwatch', filePath),
  getWatchedLogs: () => ipcRenderer.invoke('logs:getWatched'),
  onNewLog: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on('log:new', listener);
    return () => ipcRenderer.removeListener('log:new', listener);
  },
  onLogsImported: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('logs:imported', listener);
    return () => ipcRenderer.removeListener('logs:imported', listener);
  },
  onWatchStarted: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('watch:started', listener);
    return () => ipcRenderer.removeListener('watch:started', listener);
  },
  onWatchStopped: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('watch:stopped', listener);
    return () => ipcRenderer.removeListener('watch:stopped', listener);
  },
  onLogsCleared: (callback) => {
    const listener = (_event) => callback();
    ipcRenderer.on('log:cleared', listener);
    return () => ipcRenderer.removeListener('log:cleared', listener);
  }
});

contextBridge.exposeInMainWorld('configAPI', {
  get: () => ipcRenderer.invoke('config:get'),
  save: (partial) => ipcRenderer.invoke('config:save', partial),
  reset: () => ipcRenderer.invoke('config:reset')
});
