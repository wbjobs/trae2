# 蒸汽机械联动结构拆装模拟联机休闲游戏

一款支持多人联机协作的蒸汽机械结构拆装模拟游戏，采用 WebSocket 实时通信，支持 PC 与网页端双平台。

## 功能特性

- **多人联机协作**: 支持多名玩家同时在线协作拆装机械结构
- **服务端统一校验**: 服务端统一校验装配逻辑，确保数据一致性
- **实时场景同步**: 所有玩家的操作实时同步到场景中
- **多平台支持**: 同时支持 PC (Electron) 和网页端 (Web)
- **本地 + 云端存档**: 支持本地存档和云端存档
- **三个关卡**: 基础蒸汽机、齿轮传动系统、蒸汽机车

## 技术架构

```
项目结构:
├── client/                    # 客户端
│   ├── web/                   # 网页端
│   │   ├── index.html         # 入口页面
│   │   ├── css/               # 样式文件
│   │   └── src/               # JavaScript 源码
│   │       ├── game.js        # 游戏主逻辑
│   │       ├── renderer.js    # 3D 渲染器 (Three.js)
│   │       ├── network.js     # 网络通信
│   │       ├── input.js       # 输入处理
│   │       └── storage.js     # 本地存储
│   └── desktop/               # 桌面端
│       ├── main.js            # Electron 主进程
│       └── preload.js         # 预加载脚本
├── server/                    # 服务端
│   └── src/
│       ├── index.js           # 服务端入口
│       ├── gameLogic.js       # 游戏逻辑
│       ├── assemblyValidator.js # 装配校验器
│       ├── syncManager.js     # 状态同步管理
│       ├── levelManager.js    # 关卡管理
│       ├── saveManager.js     # 存档管理
│       └── config/
│           └── levels.js      # 关卡配置
├── shared/                    # 共享模块
│   ├── protocol.js            # 网络协议定义
│   └── types.js               # 类型定义
└── package.json               # 项目配置
```

## 安装与运行

### 环境要求

- Node.js >= 16.x
- npm 或 yarn

### 快速开始

1. **克隆项目并安装依赖**
```bash
npm install
```

2. **启动服务端**
```bash
npm start
```
服务端将在 `http://localhost:3000` 启动

3. **访问网页端**
打开浏览器访问 `http://localhost:3000`

### Windows 一键启动
```bash
start.bat
```

### Linux/Mac 启动
```bash
chmod +x start.sh
./start.sh
```

### 桌面端运行
```bash
cd client/desktop
npm install
npm start
```

## 操作说明

| 操作 | 按键/按钮 |
|------|----------|
| 选择零件 | 鼠标左键点击 |
| 抓取/释放零件 | G 键 |
| 移动零件 | 鼠标拖动 (抓取状态) |
| 调整高度 | 滚轮 |
| 旋转零件 | 滚轮 (旋转模式) |
| 切换移动/旋转模式 | R 键 |
| 装配零件 | 空格键 (抓取状态) |
| 拆解零件 | 点击已装配零件后按 G 键 |
| 旋转视角 | 鼠标右键拖动 |
| 缩放视角 | 滚轮 (未抓取零件) |

## 关卡列表

1. **基础蒸汽机** (难度: 1) - 学习基础蒸汽机械结构的装配与拆解
2. **齿轮传动系统** (难度: 2) - 复杂齿轮传动系统的装配与联动测试
3. **蒸汽机车** (难度: 3) - 完整蒸汽机车动力系统的装配挑战

## 网络协议

游戏使用 WebSocket 进行实时通信，主要消息类型:

- `player_join` / `player_leave` - 玩家加入/离开
- `part_grab` / `part_release` - 抓取/释放零件
- `part_move` / `part_rotate` - 移动/旋转零件
- `part_assemble` / `part_disassemble` - 装配/拆解零件
- `scene_sync` / `scene_state` - 场景状态同步
- `save_create` / `save_load` - 存档创建/加载
- `chat_message` - 聊天消息

## 开发说明

### 服务端开发
服务端使用 Node.js + WebSocket 构建，核心模块:

- `assemblyValidator.js` - 装配逻辑校验
- `syncManager.js` - 场景状态同步
- `levelManager.js` - 关卡配置管理
- `saveManager.js` - 存档管理

### 客户端开发
客户端使用 Three.js 进行 3D 渲染:

- `renderer.js` - Three.js 渲染器
- `network.js` - WebSocket 通信
- `input.js` - 输入事件处理
- `storage.js` - 本地存储 (localStorage)

### 添加新关卡
在 `server/src/config/levels.js` 中添加新的关卡配置:

```javascript
'new-level': {
  id: 'new-level',
  name: '新关卡名称',
  description: '关卡描述',
  difficulty: 1,
  parts: [
    {
      id: 'part-id',
      name: '零件名称',
      type: 'part-type',
      model: 'box|cylinder|sphere',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      targetPosition: { x: 0, y: 0, z: 0 },
      snapPoints: [...],
      connections: ['other-part-id'],
      properties: { color: '#FF0000', size: { x: 1, y: 1, z: 1 } }
    }
  ]
}
```

## 许可证

MIT License
