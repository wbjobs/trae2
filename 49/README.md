# ⚙ 复古机械组装 - Mech Assembly

一款复古风格的机械结构组装休闲联机游戏，支持多人协作完成机械零件拼接。

## 功能特性

- 🎮 **3D实时渲染** - 使用Three.js实现复古机械零件的精美3D渲染
- 👥 **多人联机协作** - 通过Socket.io实现实时多人联机，共同组装机械结构
- 🧩 **智能吸附组装** - 零件靠近时自动吸附并验证组装逻辑
- 📊 **实时状态同步** - 服务端统一校验，全玩家场景状态实时同步
- 💾 **本地存档系统** - 支持游戏进度保存与读取
- 🎯 **多关卡设计** - 3个难度递增的关卡：齿轮入门、杠杆原理、时钟机械
- 💬 **内置聊天系统** - 玩家间可实时交流协作
- 🖥 **双平台支持** - 同时支持网页端和PC端（Electron）

## 项目结构

```
mech-assembly-game/
├── shared/                    # 共享模块
│   ├── partTypes.js          # 零件类型、颜色、连接类型定义
│   ├── partData.js           # 零件数据结构与工厂类
│   ├── gameState.js          # 游戏状态与玩家管理
│   ├── levels.js             # 关卡配置与管理
│   └── saveSystem.js         # 存档系统
├── server/                    # 服务端模块
│   ├── main.js               # 服务器主入口与Socket.io通信
│   └── assemblyLogic.js      # 组装校验与管理逻辑
├── client/                    # 客户端模块
│   ├── js/
│   │   ├── partRenderer.js   # Three.js零件渲染器
│   │   └── gameClient.js     # 游戏客户端逻辑
│   └── css/
│       └── style.css         # 游戏UI样式
├── public/                    # 网页端入口
│   └── index.html            # 游戏主页面
├── electron/                  # PC端（Electron）
│   └── main.js               # Electron主进程
├── package.json               # 项目配置
└── README.md
```

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 运行游戏

#### 方式1：网页端（推荐）

```bash
npm start
```

然后在浏览器中打开：`http://localhost:3000`

#### 方式2：PC端（Electron）

```bash
npm run electron
```

## 游戏操作

| 操作 | 说明 |
|------|------|
| 🖱 鼠标左键 | 选择/拖动零件 |
| 🔄 Ctrl + 滚轮 | 旋转选中零件 |
| ⌨ X/Y/Z键 | 沿对应轴旋转零件 |
| ⇧ Shift + X/Y/Z | 反向旋转零件 |
| 🗑 Delete/Backspace | 拆卸选中零件 |
| ⎋ Escape | 取消选中 |
| 🎯 靠近零件 | 自动吸附组装 |

## 游戏玩法

1. **选择关卡** - 从3个难度不同的关卡中选择
2. **加入房间** - 输入房间ID与好友联机
3. **拖动零件** - 将散落的机械零件拖放到正确位置
4. **智能吸附** - 零件靠近时自动吸附组装
5. **完成关卡** - 组装所有零件完成机械结构

## 技术栈

### 服务端
- **Node.js** - 运行环境
- **Express** - Web服务器
- **Socket.io** - 实时通信
- **UUID** - 唯一标识生成

### 客户端
- **Three.js** - 3D渲染引擎
- **OrbitControls** - 相机控制
- **Socket.io-client** - 客户端通信

### PC端
- **Electron** - 跨平台桌面应用

## 关卡介绍

### 关卡1：齿轮入门
- 难度：⭐ 简单
- 目标：学习基础的齿轮与轴组装
- 零件：底板、轴、齿轮

### 关卡2：杠杆原理
- 难度：⭐⭐ 中等
- 目标：构建一个简单的杠杆机构
- 零件：底板、支点轴、杠杆、弹簧

### 关卡3：时钟机械
- 难度：⭐⭐⭐ 困难
- 目标：组装一个简单的齿轮传动系统
- 零件：底板、多根轴、大小齿轮、表盘

## 开发说明

### 添加新零件类型

1. 在 `shared/partTypes.js` 中添加零件类型
2. 在 `shared/partData.js` 的 `PartFactory` 中创建零件创建方法
3. 在 `client/js/partRenderer.js` 中添加3D渲染方法

### 添加新关卡

在 `shared/levels.js` 的 `LevelManager` 中添加新关卡方法。

## 许可证

MIT License
