/**
 * Electron 主进程 - 窗口管理与后端服务进程控制
 * Main process for Spectrum Calibration desktop client.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow = null;
let backendProcess = null;
const isDev = process.argv.includes('--dev') || process.argv.includes('--enable-logging');

const BACKEND_PORT = 5000;
const BACKEND_HOST = '127.0.0.1';

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '光谱分析仪参数标定仿真系统',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: false
    },
    backgroundColor: '#1a1a2e',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopBackend();
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
}

function findPythonExecutable() {
  const pythonCandidates = [];

  if (process.platform === 'win32') {
    pythonCandidates.push(
      path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe'),
      'python',
      'python3',
      'py'
    );
  } else {
    pythonCandidates.push(
      path.join(__dirname, '..', 'backend', 'venv', 'bin', 'python3'),
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      'python3',
      'python'
    );
  }

  for (const python of pythonCandidates) {
    try {
      if (fs.existsSync(python) || python === 'python' || python === 'python3' || python === 'py') {
        return python;
      }
    } catch (e) {
      continue;
    }
  }
  return 'python3';
}

function startBackend() {
  const apiPath = path.join(__dirname, '..', 'backend', 'api.py');

  if (!fs.existsSync(apiPath)) {
    console.error('Backend API file not found:', apiPath);
    return null;
  }

  const python = findPythonExecutable();

  try {
    backendProcess = spawn(python, [apiPath, '--host', BACKEND_HOST, '--port', BACKEND_PORT], {
      stdio: isDev ? 'inherit' : 'pipe',
      env: {
        ...process.env,
        'PYTHONUNBUFFERED': '1',
        'FLASK_ENV': isDev ? 'development' : 'production'
      },
      windowsHide: true
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
      if (mainWindow) {
        mainWindow.webContents.send('backend-error', err.message);
      }
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`Backend exited with code ${code}, signal ${signal}`);
      if (mainWindow) {
        mainWindow.webContents.send('backend-exit', { code, signal });
      }
    });

    console.log(`Backend started: ${python} ${apiPath}`);
    return backendProcess;
  } catch (err) {
    console.error('Error starting backend:', err);
    return null;
  }
}

function stopBackend() {
  if (backendProcess) {
    try {
      backendProcess.kill('SIGTERM');
      setTimeout(() => {
        if (backendProcess) {
          backendProcess.kill('SIGKILL');
        }
      }, 3000);
    } catch (err) {
      console.error('Error stopping backend:', err);
    }
    backendProcess = null;
  }
}

function checkBackendHealth() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`http://${BACKEND_HOST}:${BACKEND_PORT}/api/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ status: 'unknown' });
        }
      });
    });
    req.on('error', () => resolve({ status: 'unreachable' }));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ status: 'timeout' });
    });
  });
}

ipcMain.handle('get-backend-config', () => {
  return {
    host: BACKEND_HOST,
    port: BACKEND_PORT,
    baseUrl: `http://${BACKEND_HOST}:${BACKEND_PORT}`
  };
});

ipcMain.handle('check-backend-health', async () => {
  return await checkBackendHealth();
});

ipcMain.handle('restart-backend', () => {
  stopBackend();
  setTimeout(() => {
    startBackend();
  }, 500);
  return { status: 'restarting' };
});

ipcMain.handle('open-file-dialog', async (event, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择参数文件',
    filters: [
      { name: 'JSON 文件', extensions: ['json'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-file-dialog', async (event, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存报告',
    defaultPath: path.join(os.homedir(), 'calibration_report.json'),
    filters: [
      { name: 'JSON 文件', extensions: ['json'] },
      { name: 'HTML 报告', extensions: ['html'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) => {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-platform-info', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    name: app.getName(),
    isDev: isDev
  };
});

app.whenReady().then(() => {
  createMainWindow();

  setTimeout(() => {
    startBackend();
  }, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopBackend();
});

process.on('SIGINT', () => {
  stopBackend();
  app.quit();
});

process.on('SIGTERM', () => {
  stopBackend();
  app.quit();
});
