/**
 * Electron 预加载脚本 - 安全桥接主进程与渲染进程
 * Preload script for Spectrum Calibration client.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendConfig: () => ipcRenderer.invoke('get-backend-config'),
  checkBackendHealth: () => ipcRenderer.invoke('check-backend-health'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),

  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  saveFileDialog: () => ipcRenderer.invoke('save-file-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),

  onBackendError: (callback) => {
    ipcRenderer.on('backend-error', (event, ...args) => callback(...args));
  },
  onBackendExit: (callback) => {
    ipcRenderer.on('backend-exit', (event, ...args) => callback(...args));
  }
});
