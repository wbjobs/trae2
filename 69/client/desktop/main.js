const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let serverProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: '蒸汽机械联动结构拆装模拟',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    backgroundColor: '#1a1a2e',
    show: false
  });

  const startUrl = process.env.ELECTRON_START_URL ||
    `file://${path.join(__dirname, '..', 'web', 'index.html')}`;

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });
}

function createMenu() {
  const template = [
    {
      label: '游戏',
      submenu: [
        {
          label: '连接服务器',
          accelerator: 'Ctrl+N',
          click: () => {
            mainWindow.webContents.send('connect-server');
          }
        },
        {
          label: '断开连接',
          accelerator: 'Ctrl+D',
          click: () => {
            mainWindow.webContents.send('disconnect-server');
          }
        },
        { type: 'separator' },
        {
          label: '重新加载',
          accelerator: 'Ctrl+R',
          click: () => {
            mainWindow.reload();
          }
        },
        {
          label: '退出',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '放大',
          accelerator: 'Ctrl+Plus',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(currentZoom + 0.5);
          }
        },
        {
          label: '缩小',
          accelerator: 'Ctrl+-',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(currentZoom - 0.5);
          }
        },
        {
          label: '重置缩放',
          accelerator: 'Ctrl+0',
          click: () => {
            mainWindow.webContents.setZoomLevel(0);
          }
        },
        { type: 'separator' },
        {
          label: '全屏',
          accelerator: 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '操作说明',
          accelerator: 'Ctrl+H',
          click: () => {
            mainWindow.webContents.send('show-help');
          }
        },
        {
          label: '关于',
          click: () => {
            const aboutWindow = new BrowserWindow({
              width: 400,
              height: 300,
              title: '关于',
              parent: mainWindow,
              modal: true,
              resizable: false,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
              }
            });
            aboutWindow.loadURL(`data:text/html,
              <html>
                <head>
                  <style>
                    body {
                      font-family: 'Segoe UI', sans-serif;
                      background: #1a1a2e;
                      color: #e0e0e0;
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                    }
                    h1 { color: #ffd700; margin-bottom: 10px; }
                    p { color: #888; margin: 5px 0; }
                  </style>
                </head>
                <body>
                  <h1>⚙️ 蒸汽机械联动</h1>
                  <p>版本: 1.0.0</p>
                  <p>多人联机拆装模拟游戏</p>
                  <p style="margin-top: 20px; font-size: 12px;">
                    支持 PC 与网页端双平台
                  </p>
                </body>
              </html>
            `);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('exit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
