import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import { PrinterService } from './PrinterService';

let mainWindow: BrowserWindow | null = null;
let printerService: PrinterService | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../renderer/assets/icon.png')
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '打印文件',
          accelerator: 'Ctrl+P',
          click: () => {
            mainWindow?.webContents.send('menu:print-file');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '工具',
      submenu: [
        {
          label: '刷新打印机列表',
          accelerator: 'F5',
          click: () => {
            mainWindow?.webContents.send('menu:refresh-printers');
          }
        },
        {
          label: '系统设置',
          click: () => {
            mainWindow?.webContents.send('menu:settings');
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { role: 'about' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupIpcHandlers() {
  printerService = new PrinterService();
  printerService.initialize();

  printerService.onStatusChange((status) => {
    mainWindow?.webContents.send('printer:status-changed', status);
  });

  printerService.onAlert((alert) => {
    mainWindow?.webContents.send('printer:alert', alert);
  });

  printerService.onCriticalAlert((alert) => {
    mainWindow?.webContents.send('printer:critical-alert', alert);

    if (mainWindow && !mainWindow.isDestroyed()) {
      const alertMessages: Record<string, string> = {
        paper_out: '缺纸告警',
        jammed: '卡纸告警',
        error: '错误告警'
      };

      const title = alertMessages[alert.type] || '打印机告警';
      const printerName = alert.printerId;

      mainWindow.webContents.send('printer:show-alert-dialog', {
        title,
        message: `${printerName}: ${alert.message}`,
        type: alert.type,
        severity: alert.severity,
        alertId: alert.id
      });
    }
  });

  printerService.onTaskUpdate((task) => {
    mainWindow?.webContents.send('printer:task-update', task);
  });

  ipcMain.handle('printer:enumerate', async () => {
    return printerService?.enumeratePrinters() || [];
  });

  ipcMain.handle('printer:getInfo', async (_, printerId: string) => {
    return printerService?.getPrinterInfo(printerId);
  });

  ipcMain.handle('printer:printFile', async (_, printerId: string, filePath: string, jobName?: string) => {
    return printerService?.printFile(printerId, filePath, jobName);
  });

  ipcMain.handle('printer:printRawData', async (_, printerId: string, data: Uint8Array, jobName?: string) => {
    return printerService?.printRawData(printerId, data, jobName);
  });

  ipcMain.handle('printer:getActiveJobs', async (_, printerId: string) => {
    return printerService?.getActiveJobs(printerId) || [];
  });

  ipcMain.handle('printer:cancelJob', async (_, printerId: string, jobId: string) => {
    return printerService?.cancelJob(printerId, jobId);
  });

  ipcMain.handle('printer:cancelAllJobs', async (_, printerId: string) => {
    return printerService?.cancelAllJobs(printerId);
  });

  ipcMain.handle('printer:pause', async (_, printerId: string) => {
    return printerService?.pausePrinter(printerId);
  });

  ipcMain.handle('printer:resume', async (_, printerId: string) => {
    return printerService?.resumePrinter(printerId);
  });

  ipcMain.handle('printer:getDefault', async () => {
    return printerService?.getDefaultPrinterId();
  });

  ipcMain.handle('printer:setDefault', async (_, printerId: string) => {
    return printerService?.setDefaultPrinter(printerId);
  });

  ipcMain.handle('task:addFile', async (_, printerId: string, filePath: string, documentName: string, settings?: any) => {
    return printerService?.addFileTask(printerId, filePath, documentName, settings);
  });

  ipcMain.handle('task:addRawData', async (_, printerId: string, data: Uint8Array, documentName: string, settings?: any) => {
    return printerService?.addRawDataTask(printerId, data, documentName, settings);
  });

  ipcMain.handle('task:getStatus', async (_, taskId: string) => {
    return printerService?.getTaskStatus(taskId);
  });

  ipcMain.handle('task:cancel', async (_, taskId: string) => {
    return printerService?.cancelTask(taskId);
  });

  ipcMain.handle('task:setPriority', async (_, taskId: string, priority: number) => {
    return printerService?.setTaskPriority(taskId, priority);
  });

  ipcMain.handle('task:getActive', async () => {
    return printerService?.getActiveTasks() || [];
  });

  ipcMain.handle('task:getCompleted', async (_, maxCount?: number) => {
    return printerService?.getCompletedTasks(maxCount) || [];
  });

  ipcMain.handle('task:getAllSortedByPriority', async () => {
    return printerService?.getAllTasksSortedByPriority() || [];
  });

  ipcMain.handle('template:getAll', async () => {
    return printerService?.getAllTemplates() || [];
  });

  ipcMain.handle('template:create', async (_, template: any) => {
    return printerService?.createTemplate(template);
  });

  ipcMain.handle('template:update', async (_, templateId: string, template: any) => {
    return printerService?.updateTemplate(templateId, template);
  });

  ipcMain.handle('template:delete', async (_, templateId: string) => {
    return printerService?.deleteTemplate(templateId);
  });

  ipcMain.handle('template:render', async (_, templateId: string, options: any) => {
    return printerService?.renderTemplate(templateId, options);
  });

  ipcMain.handle('template:batchImport', async (_, filePaths: string[]) => {
    return printerService?.batchImportTemplates(filePaths);
  });

  ipcMain.handle('template:batchExport', async (_, templateIds: string[], directoryPath: string) => {
    return printerService?.batchExportTemplates(templateIds, directoryPath);
  });

  ipcMain.handle('dialog:openFile', async (_, filters?: any[]) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [
        { name: '所有文件', extensions: ['*'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'bmp'] },
        { name: '文本', extensions: ['txt'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:openFiles', async (_, filters?: any[]) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['multiSelections', 'openFile'],
      filters: filters || [
        { name: '模板文件', extensions: ['json', 'zpl', 'epl', 'txt', 'tmpl'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async (_, filters?: any[]) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: filters || [
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', async () => {
    return process.platform;
  });
}

app.whenReady().then(() => {
  createWindow();
  createMenu();
  setupIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    printerService?.shutdown();
    app.quit();
  }
});

app.on('before-quit', () => {
  printerService?.shutdown();
});
