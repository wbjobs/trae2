import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('printerAPI', {
  enumeratePrinters: () => ipcRenderer.invoke('printer:enumerate'),
  getPrinterInfo: (printerId: string) => ipcRenderer.invoke('printer:getInfo', printerId),
  printFile: (printerId: string, filePath: string, jobName?: string) =>
    ipcRenderer.invoke('printer:printFile', printerId, filePath, jobName),
  printRawData: (printerId: string, data: Uint8Array, jobName?: string) =>
    ipcRenderer.invoke('printer:printRawData', printerId, data, jobName),
  getActiveJobs: (printerId: string) => ipcRenderer.invoke('printer:getActiveJobs', printerId),
  cancelJob: (printerId: string, jobId: string) => ipcRenderer.invoke('printer:cancelJob', printerId, jobId),
  cancelAllJobs: (printerId: string) => ipcRenderer.invoke('printer:cancelAllJobs', printerId),
  pausePrinter: (printerId: string) => ipcRenderer.invoke('printer:pause', printerId),
  resumePrinter: (printerId: string) => ipcRenderer.invoke('printer:resume', printerId),
  getDefaultPrinterId: () => ipcRenderer.invoke('printer:getDefault'),
  setDefaultPrinter: (printerId: string) => ipcRenderer.invoke('printer:setDefault', printerId),

  addFileTask: (printerId: string, filePath: string, documentName: string, settings?: any) =>
    ipcRenderer.invoke('task:addFile', printerId, filePath, documentName, settings),
  addRawDataTask: (printerId: string, data: Uint8Array, documentName: string, settings?: any) =>
    ipcRenderer.invoke('task:addRawData', printerId, data, documentName, settings),
  getTaskStatus: (taskId: string) => ipcRenderer.invoke('task:getStatus', taskId),
  cancelTask: (taskId: string) => ipcRenderer.invoke('task:cancel', taskId),
  setTaskPriority: (taskId: string, priority: number) =>
    ipcRenderer.invoke('task:setPriority', taskId, priority),
  getActiveTasks: () => ipcRenderer.invoke('task:getActive'),
  getCompletedTasks: (maxCount?: number) => ipcRenderer.invoke('task:getCompleted', maxCount),
  getAllTasksSortedByPriority: () => ipcRenderer.invoke('task:getAllSortedByPriority'),

  getAllTemplates: () => ipcRenderer.invoke('template:getAll'),
  createTemplate: (template: any) => ipcRenderer.invoke('template:create', template),
  updateTemplate: (templateId: string, template: any) =>
    ipcRenderer.invoke('template:update', templateId, template),
  deleteTemplate: (templateId: string) => ipcRenderer.invoke('template:delete', templateId),
  renderTemplate: (templateId: string, options: any) =>
    ipcRenderer.invoke('template:render', templateId, options),
  batchImportTemplates: (filePaths: string[]) =>
    ipcRenderer.invoke('template:batchImport', filePaths),
  batchExportTemplates: (templateIds: string[], directoryPath: string) =>
    ipcRenderer.invoke('template:batchExport', templateIds, directoryPath),

  openFileDialog: (filters?: any[]) => ipcRenderer.invoke('dialog:openFile', filters),
  openFilesDialog: (filters?: any[]) => ipcRenderer.invoke('dialog:openFiles', filters),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  saveFileDialog: (filters?: any[]) => ipcRenderer.invoke('dialog:saveFile', filters),

  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  onStatusChange: (callback: (status: any) => void) => {
    ipcRenderer.on('printer:status-changed', (_, status) => callback(status));
  },
  onAlert: (callback: (alert: any) => void) => {
    ipcRenderer.on('printer:alert', (_, alert) => callback(alert));
  },
  onCriticalAlert: (callback: (alert: any) => void) => {
    ipcRenderer.on('printer:critical-alert', (_, alert) => callback(alert));
  },
  onAlertDialog: (callback: (data: any) => void) => {
    ipcRenderer.on('printer:show-alert-dialog', (_, data) => callback(data));
  },
  onTaskUpdate: (callback: (task: any) => void) => {
    ipcRenderer.on('printer:task-update', (_, task) => callback(task));
  },
  onRefreshPrinters: (callback: () => void) => {
    ipcRenderer.on('menu:refresh-printers', () => callback());
  },
  onPrintFile: (callback: () => void) => {
    ipcRenderer.on('menu:print-file', () => callback());
  },
  onSettings: (callback: () => void) => {
    ipcRenderer.on('menu:settings', () => callback());
  }
});

declare global {
  interface Window {
    printerAPI: typeof printerAPI;
  }
}
