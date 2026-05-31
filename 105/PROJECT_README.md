# 矿山井下设备应急处置实训系统

## 项目概述

本项目基于 **Godot 4.2** 引擎开发，是一款矿山井下设备应急处置实训游戏。系统通过模拟真实的井下作业环境和设备故障场景，帮助学员掌握应急处置流程和操作规范。

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      客户端 (Godot)                          │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│ 井下场景模块 │ 设备故障模块 │ 应急操作模块 │ 多人联机模块      │
└─────────────┴─────────────┴─────────────┴───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Socket 通信层 (TCP)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     服务端 (Godot)                          │
├─────────────────────┬───────────────────────────────────────┤
│  实训评分存储模块    │       SQLite 数据库                   │
└─────────────────────┴───────────────────────────────────────┘
```

## 系统模块

### 1. 井下场景模块 (`scripts/scene/`)
- 3D 井下环境生成（巷道、设备、照明）
- 第一人称玩家控制器（WASD 移动 + 鼠标视角）
- 6 种典型井下设备（水泵、通风机、输送机、变电所、液压站、监控室）
- 设备交互系统（射线检测 + E 键交互）

**核心文件**:
- [MineSceneManager.gd](file:///e:/标注项目/trae2/105/scripts/scene/MineSceneManager.gd) - 场景管理
- [UILayer.gd](file:///e:/标注项目/trae2/105/scripts/scene/UILayer.gd) - UI 层控制
- [MineSceneRoot.gd](file:///e:/标注项目/trae2/105/scripts/scene/MineSceneRoot.gd) - 场景根节点

### 2. 设备故障模拟模块 (`scripts/equipment/`)
- 8 种故障类型定义（过热、泄漏、停电、机械故障等）
- 4 级严重程度划分（低、中、高、危急）
- 随机故障触发机制（可配置间隔和概率）
- 故障计时和超时处理

**核心文件**:
- [FaultManager.gd](file:///e:/标注项目/trae2/105/scripts/equipment/FaultManager.gd) - 故障管理器

### 3. 应急操作模块 (`scripts/emergency/`)
- 4 套完整应急处置流程（60+ 操作步骤）
- 步骤验证和评分系统
- 操作记录和回溯
- 限时处置机制

**核心文件**:
- [EmergencyManager.gd](file:///e:/标注项目/trae2/105/scripts/emergency/EmergencyManager.gd) - 应急流程管理

### 4. 多人联机模块 (`scripts/network/`)
- 基于 TCP Socket 的 C/S 架构
- 实时消息广播（故障、操作、同步）
- 房间系统（主机创建 / 客户端加入）
- 玩家列表管理

**核心文件**:
- [NetworkManager.gd](file:///e:/标注项目/trae2/105/scripts/network/NetworkManager.gd) - 网络管理

**协议文档**: [NETWORK_PROTOCOL.md](file:///e:/标注项目/trae2/105/NETWORK_PROTOCOL.md)

### 5. 实训评分存储模块 (`scripts/database/`)
- SQLite 数据库存储（优先）
- JSON 文件备份存储
- 实训记录管理（成绩、用时、操作详情）
- 统计分析功能

**核心文件**:
- [DatabaseManager.gd](file:///e:/标注项目/trae2/105/scripts/database/DatabaseManager.gd) - 数据库管理

**数据库表结构**:
- `training_records` - 实训主记录
- `operation_logs` - 操作明细日志
- `equipment_status` - 设备状态统计

## 操作说明

### 控制键位

| 按键 | 功能 |
|------|------|
| W / ↑ | 向前移动 |
| S / ↓ | 向后移动 |
| A / ← | 向左移动 |
| D / → | 向右移动 |
| 鼠标 | 视角旋转 |
| E | 与设备交互 |
| ESC | 释放/锁定鼠标 |

### 游戏流程

**单人模式**:
1. 输入学员姓名
2. 选择难度（简单/普通/困难）
3. 进入井下场景
4. 等待设备故障触发
5. 接近故障设备，按 E 键交互
6. 按照流程选择正确的应急操作
7. 完成所有步骤后查看评分

**多人模式**:
1. 主机：创建房间 → 设置端口 → 开始游戏
2. 客户端：输入主机 IP 和端口 → 加入房间
3. 主机控制训练流程
4. 多人协同完成应急处置
5. 所有客户端同步显示操作和结果

## 评分规则

### 得分组成

| 项目 | 分值 | 说明 |
|------|------|------|
| 基础分 | 100 分 | 根据步骤完成情况 |
| 步骤分 | 10-25 分/步 | 每步正确操作得分 |
| 时间奖励 | 0-10 分/步 | 10 秒内完成额外加分 |
| 完成奖励 | 0-10 分 | 剩余时间 >30 秒加分 |
| 错误扣分 | 0 分 | 操作错误不扣分但计入错误次数 |

### 失败条件

- 错误次数 ≥ 3 次
- 处置时间超时
- 关键步骤遗漏

## 项目结构

```
105/
├── project.godot              # Godot 项目配置
├── icon.svg                   # 项目图标
├── PROJECT_README.md          # 本文件
├── NETWORK_PROTOCOL.md        # 网络协议文档
├── scripts/
│   ├── GameManager.gd         # 全局游戏管理器（自动加载）
│   ├── MainMenu.gd            # 主菜单脚本
│   ├── scene/
│   │   ├── MineSceneManager.gd    # 井下场景管理
│   │   ├── MineSceneRoot.gd       # 场景根节点
│   │   └── UILayer.gd             # UI 层
│   ├── equipment/
│   │   └── FaultManager.gd        # 故障管理
│   ├── emergency/
│   │   └── EmergencyManager.gd    # 应急流程管理
│   ├── network/
│   │   └── NetworkManager.gd      # 网络通信
│   └── database/
│       └── DatabaseManager.gd     # 数据库管理
├── scenes/
│   ├── MainMenu.tscn          # 主菜单场景
│   └── MineScene.tscn         # 井下场景
└── assets/
    ├── models/                # 3D 模型目录
    ├── textures/              # 纹理贴图目录
    └── ui/                    # UI 资源目录
```

## 运行环境

### 最低配置
- 操作系统：Windows 10 / macOS 10.15 / Linux
- CPU：Intel Core i5 或同等性能
- 内存：8 GB RAM
- 显卡：支持 Vulkan 1.0，2 GB 显存
- 存储空间：2 GB 可用空间

### 推荐配置
- 操作系统：Windows 11 / macOS 12+ / Linux
- CPU：Intel Core i7 / AMD Ryzen 7 或更高
- 内存：16 GB RAM
- 显卡：NVIDIA RTX 2060 或同等性能，4 GB 显存
- 存储空间：5 GB 可用空间

### 软件依赖
- Godot Engine 4.2+ (https://godotengine.org/)
- （可选）godot-sqlite 插件 (https://github.com/2shady4u/godot-sqlite)

## 安装和运行

### 方法一：使用 Godot 编辑器

1. 下载并安装 [Godot Engine 4.2+](https://godotengine.org/download)
2. 启动 Godot 编辑器
3. 点击 "Import" 按钮，选择 `project.godot` 文件
4. 点击 "Play" 按钮或按 F5 运行项目

### 方法二：命令行运行

```bash
# 进入项目目录
cd "e:\标注项目\trae2\105"

# 使用 Godot 运行项目
godot --path .

# 导出为可执行文件（需先配置导出模板）
godot --export "Windows Desktop" "MiningTraining.exe"
```

### 多人联机测试

1. **启动主机**：
   - 运行游戏 → 输入姓名 → "创建联机房间" → 设置端口 → 开始

2. **启动客户端**（另一台电脑或另一个实例）：
   - 运行游戏 → 输入姓名 → "加入联机房间" → 输入主机 IP 和端口 → 连接

3. **本地测试**（同一台电脑）：
   - 主机使用默认设置
   - 客户端主机地址填 `127.0.0.1`

## 故障处置流程示例

### 设备过热处置流程

1. **切断设备电源** - 按下紧急停止按钮 / 切断主电源
2. **疏散周边人员** - 警示周边人员 / 疏散作业区域
3. **检测温度情况** - 测量设备温度 / 查看仪表读数
4. **实施冷却措施** - 喷水降温 / 使用灭火器 / 启动冷却系统
5. **加强通风换气** - 开启通风设备 / 打开风门
6. **上报调度室** - 呼叫调度室 / 汇报当前状态
7. **设置警示隔离** - 设置警示标志 / 隔离危险区域
8. **确认处置完成** - 确认安全 / 复核温度

## 常见问题

### Q: 数据库无法连接？
A: 系统会自动降级为 JSON 文件存储，不影响使用。如需 SQLite 支持，请安装 godot-sqlite 插件到 `addons/godot-sqlite/` 目录。

### Q: 鼠标无法控制视角？
A: 按 ESC 键切换鼠标锁定状态，确保鼠标被游戏窗口捕获。

### Q: 多人连接失败？
A: 
1. 检查防火墙是否阻止了 Godot 的网络访问
2. 确认主机和客户端在同一局域网
3. 公网联机需要端口映射或使用 VPN

### Q: 游戏运行卡顿？
A: 
1. 在 Godot 编辑器中降低渲染质量
2. 关闭其他占用资源的程序
3. 确保显卡驱动为最新版本

## 扩展开发

### 添加新的故障类型

1. 在 `FaultManager.gd` 的 `FaultType` 中添加新类型
2. 在 `FAULT_DEFINITIONS` 中添加故障详情
3. 在 `EmergencyManager.gd` 中添加对应的处置流程
4. 在设备定义中添加可能发生的故障类型

### 添加新设备

1. 在 `MineSceneManager.gd` 的 `equipment_definitions` 中添加设备
2. 配置设备名称、类型、位置、可能故障、可执行操作
3. （可选）在 `_create_equipment_node` 中自定义设备外观

### 自定义处置流程

在 `EmergencyManager.gd` 的 `EMERGENCY_PROCEDURES` 中修改或添加流程，每个步骤包含：
- `id`: 步骤唯一标识
- `name`: 步骤名称
- `description`: 操作说明
- `score`: 正确操作得分
- `time_bonus`: 快速完成奖励分
- `correct_actions`: 正确操作 ID 列表

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-05-28 | 初始版本，完成所有核心模块 |

## 技术支持

如遇问题或需要技术支持，请参考：
- Godot 官方文档：https://docs.godotengine.org/
- 网络协议说明：[NETWORK_PROTOCOL.md](file:///e:/标注项目/trae2/105/NETWORK_PROTOCOL.md)

## 许可证

本项目用于教育和培训目的。
