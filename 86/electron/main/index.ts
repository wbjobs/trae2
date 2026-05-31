import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null
let hardwareMonitor: any = null

try {
  const nativePath = path.join(process.env.APP_ROOT, 'native', 'target', 'release', 'hardware_monitor.node')
  if (fs.existsSync(nativePath)) {
    hardwareMonitor = require(nativePath)
    console.log('[HardwareMonitor] Native module loaded successfully')
  } else {
    console.warn('[HardwareMonitor] Native module not found at:', nativePath)
  }
} catch (error) {
  console.error('[HardwareMonitor] Failed to load native module:', error)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: 'Hardware Monitor Suite',
    icon: path.join(process.env.VITE_PUBLIC!, 'favicon.ico'),
    webPreferences: {
      preload: path.join(MAIN_DIST, 'preload', 'index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,
    },
    backgroundColor: '#1a1a2e',
    frame: true,
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.on('closed', () => {
    win = null
  })
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '导入配置',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openFile'],
              filters: [
                { name: '配置文件', extensions: ['json', 'yaml', 'yml'] },
                { name: '所有文件', extensions: ['*'] },
              ],
            })
            if (!result.canceled && result.filePaths.length > 0) {
              win?.webContents.send('config:import', result.filePaths[0])
            }
          },
        },
        {
          label: '导出配置',
          click: async () => {
            const result = await dialog.showSaveDialog({
              filters: [
                { name: 'JSON 配置', extensions: ['json'] },
                { name: 'YAML 配置', extensions: ['yaml'] },
              ],
            })
            if (!result.canceled && result.filePath) {
              win?.webContents.send('config:export', result.filePath)
            }
          },
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.quit()
          },
        },
      ],
    },
    {
      label: '操作',
      submenu: [
        {
          label: '刷新数据',
          accelerator: 'F5',
          click: () => {
            win?.webContents.send('action:refresh')
          },
        },
        {
          label: '开始采集',
          accelerator: 'Ctrl+S',
          click: () => {
            win?.webContents.send('action:start')
          },
        },
        {
          label: '停止采集',
          accelerator: 'Ctrl+Shift+S',
          click: () => {
            win?.webContents.send('action:stop')
          },
        },
        { type: 'separator' },
        {
          label: '清空数据',
          click: () => {
            win?.webContents.send('action:clear')
          },
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '刷新',
          accelerator: 'F5',
          role: 'reload',
        },
        {
          label: '开发者工具',
          accelerator: 'F12',
          role: 'toggleDevTools',
        },
        { type: 'separator' },
        {
          label: '全屏',
          accelerator: 'F11',
          role: 'togglefullscreen',
        },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(win!, {
              type: 'info',
              title: '关于 Hardware Monitor Suite',
              message: 'Hardware Monitor Suite v1.0.0',
              detail: '跨平台硬件参数采集桌面应用套件\n\n基于 Electron + Rust 开发\n支持 Windows / Linux 双平台',
            })
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()
  createMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

ipcMain.handle('hardware:init', async () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.initHardware()
  } catch (error) {
    console.error('[Hardware] Init error:', error)
    throw error
  }
})

ipcMain.handle('hardware:collectOnce', async () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    await monitor.initHardware()
    return await monitor.collectOnce()
  } catch (error) {
    console.error('[Hardware] Collect error:', error)
    throw error
  }
})

ipcMain.handle('hardware:collectParallel', async () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    await monitor.initHardware()
    return await monitor.collectParallel()
  } catch (error) {
    console.error('[Hardware] Collect parallel error:', error)
    throw error
  }
})

ipcMain.handle('hardware:getSystemInfo', () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return monitor.getSystemInfo()
  } catch (error) {
    console.error('[Hardware] System info error:', error)
    throw error
  }
})

ipcMain.handle('hardware:getAggregatedData', async () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    await monitor.initHardware()
    return await monitor.getAggregatedData()
  } catch (error) {
    console.error('[Hardware] Aggregated data error:', error)
    throw error
  }
})

ipcMain.handle('hardware:getCollectorStatus', async () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.getCollectorStatus()
  } catch (error) {
    console.error('[Hardware] Status error:', error)
    throw error
  }
})

ipcMain.handle('config:load', async (_, configPath: string) => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.loadConfig(configPath)
  } catch (error) {
    console.error('[Config] Load error:', error)
    throw error
  }
})

ipcMain.handle('config:loadFromJson', async (_, jsonString: string) => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.loadConfigFromJson(jsonString)
  } catch (error) {
    console.error('[Config] Load from JSON error:', error)
    throw error
  }
})

ipcMain.handle('config:get', async () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.getConfig()
  } catch (error) {
    console.error('[Config] Get error:', error)
    throw error
  }
})

ipcMain.handle('reporter:init', async (_, endpointUrl: string, authToken?: string, encryptionKey?: string) => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.initReporter(endpointUrl, authToken, encryptionKey)
  } catch (error) {
    console.error('[Reporter] Init error:', error)
    throw error
  }
})

ipcMain.handle('reporter:report', async (_, data: string) => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.reportData(data)
  } catch (error) {
    console.error('[Reporter] Report error:', error)
    throw error
  }
})

ipcMain.handle('reporter:reportBatch', async (_, dataArray: string[]) => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.reportBatch(dataArray)
  } catch (error) {
    console.error('[Reporter] Batch error:', error)
    throw error
  }
})

ipcMain.handle('reporter:queueData', async (_, data: string) => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.queueData(data)
  } catch (error) {
    console.error('[Reporter] Queue error:', error)
    throw error
  }
})

ipcMain.handle('reporter:flush', async () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.flushReporter()
  } catch (error) {
    console.error('[Reporter] Flush error:', error)
    throw error
  }
})

ipcMain.handle('reporter:getStatus', async () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return await monitor.getReporterStatus()
  } catch (error) {
    console.error('[Reporter] Status error:', error)
    throw error
  }
})

ipcMain.handle('encryption:generateKey', () => {
  if (!hardwareMonitor) {
    throw new Error('Native module not loaded')
  }
  try {
    const monitor = new hardwareMonitor.NapiHardwareMonitor()
    return monitor.generateEncryptionKey()
  } catch (error) {
    console.error('[Encryption] Generate key error:', error)
    throw error
  }
})

ipcMain.handle('config:readFile', async (_, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content
  } catch (error) {
    console.error('[Config] Read file error:', error)
    throw error
  }
})

ipcMain.handle('config:writeFile', async (_, filePath: string, content: string) => {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (error) {
    console.error('[Config] Write file error:', error)
    throw error
  }
})

ipcMain.handle('config:deleteFile', async (_, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return true
  } catch (error) {
    console.error('[Config] Delete file error:', error)
    throw error
  }
})

ipcMain.handle('config:listConfigs', async (_, dirPath: string) => {
  try {
    if (!fs.existsSync(dirPath)) {
      return []
    }
    const files = fs.readdirSync(dirPath)
    const configFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'))
    return configFiles.map(f => ({
      name: f,
      path: path.join(dirPath, f),
    }))
  } catch (error) {
    console.error('[Config] List error:', error)
    throw error
  }
})

ipcMain.handle('config:batchImport', async (_, sourceDir: string, targetDir: string) => {
  try {
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Source directory not found: ${sourceDir}`)
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    const files = fs.readdirSync(sourceDir)
    const imported: string[] = []
    const errors: string[] = []
    for (const file of files) {
      if (!file.endsWith('.json') && !file.endsWith('.yaml') && !file.endsWith('.yml')) continue
      try {
        const srcPath = path.join(sourceDir, file)
        const destPath = path.join(targetDir, file)
        if (fs.existsSync(destPath)) {
          const base = path.basename(file, path.extname(file))
          const ext = path.extname(file)
          const timestamp = Date.now()
          const newName = `${base}_${timestamp}${ext}`
          fs.copyFileSync(srcPath, path.join(targetDir, newName))
          imported.push(newName)
        } else {
          fs.copyFileSync(srcPath, destPath)
          imported.push(file)
        }
      } catch (err: any) {
        errors.push(`${file}: ${err.message}`)
      }
    }
    return { imported, errors, total: imported.length }
  } catch (error: any) {
    console.error('[Config] Batch import error:', error)
    throw error
  }
})

ipcMain.handle('config:batchExport', async (_, configDir: string) => {
  try {
    if (!fs.existsSync(configDir)) {
      throw new Error(`Config directory not found: ${configDir}`)
    }
    const files = fs.readdirSync(configDir)
    const configFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'))
    const result: Array<{ name: string; content: string }> = []
    for (const file of configFiles) {
      const filePath = path.join(configDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      result.push({ name: file, content })
    }
    return result
  } catch (error: any) {
    console.error('[Config] Batch export error:', error)
    throw error
  }
})

ipcMain.handle('config:exportToFile', async (_, targetPath: string, configs: Array<{ name: string; content: string }>) => {
  try {
    const exportDir = path.join(targetPath, `configs-export-${Date.now()}`)
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }
    const exported: string[] = []
    for (const cfg of configs) {
      const filePath = path.join(exportDir, cfg.name)
      fs.writeFileSync(filePath, cfg.content, 'utf-8')
      exported.push(cfg.name)
    }
    return { dir: exportDir, count: exported.length, files: exported }
  } catch (error: any) {
    console.error('[Config] Export to file error:', error)
    throw error
  }
})

ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPlatform', () => {
  return process.platform
})

ipcMain.handle('app:getAppPath', (_, name: string) => {
  return app.getPath(name as any)
})

ipcMain.on('external:open', (_, url: string) => {
  shell.openExternal(url)
})

app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
})
