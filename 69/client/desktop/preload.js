const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  connectServer: () => ipcRenderer.send('connect-server'),
  disconnectServer: () => ipcRenderer.send('disconnect-server'),
  showHelp: () => ipcRenderer.send('show-help'),

  onConnectServer: (callback) => ipcRenderer.on('connect-server', callback),
  onDisconnectServer: (callback) => ipcRenderer.on('disconnect-server', callback),
  onShowHelp: (callback) => ipcRenderer.on('show-help', callback)
});
