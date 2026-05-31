import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronIPC', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const subscription = (_event: unknown, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.off(channel, subscription);
  },
  removeListener: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, listener);
  },
});
