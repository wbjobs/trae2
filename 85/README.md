# 工业设备模拟故障推演系统

基于 Unity + C# + Socket + SQLite 的工业设备模拟故障推演客户端游戏系统。

## 项目概述

本项目实现了一个完整的工业设备故障模拟推演系统，支持多人联机开展故障模拟推演，实现客户端与服务端跨网络交互。

## 项目结构

```
e:\trae2\85
├── UnityClient/              # Unity 客户端项目
│   └── Assets/
│       └── Scripts/
│           ├── Core/         # 核心管理模块
│           │   ├── UnityMainThreadDispatcher.cs
│           │   └── GameManager.cs
│           ├── Modules/
│           │   ├── Database/       # 本地数据存储模块
│           │   │   └── SQLiteManager.cs
│           │   ├── Network/        # 网络通信模块
│           │   │   └── NetworkClient.cs
│           │   ├── Equipment/      # 设备逻辑模块
│           │   │   ├── EquipmentBase.cs
│           │   │   ├── EquipmentTypes.cs
│           │   │   └── EquipmentManager.cs
│           │   ├── FaultSimulation/ # 故障推演模块
│           │   │   └── FaultSimulationManager.cs
│           │   └── Scene/          # 游戏场景模块
│           │       └── WorkshopManager.cs
│           └── UI/           # UI 界面模块
│               └── MainUIController.cs
│
├── SocketServer/             # Socket 服务端项目
│   ├── Core/
│   │   └── ServerConfig.cs
│   ├── Network/
│   │   ├── NetworkServer.cs
│   │   └── MessageHandler.cs
│   ├── Simulation/
│   │   └── SimulationEngine.cs
│   ├── Program.cs
│   └── IndustrialSimulation.Server.csproj
│
└── Shared/                   # 共享库
    ├── Models/
    │   ├── EquipmentModel.cs
    │   └── FaultModel.cs
    ├── Protocols/
    │   └── NetworkProtocol.cs
    └── Utils/
        └── JsonHelper.cs
```

## 模块说明

### 1. 游戏场景模块 (Scene Module)
- **WorkshopManager**: 车间场景管理，负责创建和管理多车间3D场景
- 支持动态创建车间环境（地面、墙壁、灯光等）
- 车间切换和场景元素管理

### 2. 设备逻辑模块 (Equipment Module)
- **EquipmentBase**: 工业设备基类，定义通用设备行为
- **EquipmentTypes**: 具体设备类型实现
  - PumpEquipment (泵)
  - MotorEquipment (电机)
  - CompressorEquipment (压缩机)
  - ConveyorEquipment (传送带)
  - BoilerEquipment (锅炉)
  - ValveEquipment (阀门)
  - SensorEquipment (传感器)
- **EquipmentManager**: 设备管理器，负责设备生命周期管理

### 3. 故障推演模块 (Fault Simulation Module)
- **FaultSimulationManager**: 故障推演管理器
- 支持故障注入、故障解决、自动故障生成
- 推演记录管理和推演速度控制

### 4. 网络通信模块 (Network Module)
- **NetworkClient**: 客户端网络通信
- **NetworkServer**: 服务端网络通信
- 支持多人联机、数据同步、心跳检测
- 基于 TCP Socket 的自定义协议

### 5. 本地数据存储模块 (Database Module)
- **SQLiteManager**: SQLite 数据库封装
- 存储推演记录、设备参数、故障定义
- 支持数据持久化和本地查询

## 功能特性

### 客户端功能
- ✅ 多车间 3D 场景搭建
- ✅ 7 种工业设备模拟运行
- ✅ 实时设备参数监控
- ✅ 手动/自动故障注入
- ✅ 故障解决和状态恢复
- ✅ 本地 SQLite 数据存储
- ✅ 网络联机模式支持
- ✅ 推演记录查看

### 服务端功能
- ✅ 多客户端连接管理
- ✅ 推演会话协调
- ✅ 设备状态同步
- ✅ 故障事件广播
- ✅ 心跳检测和超时处理
- ✅ 实时模拟循环

## 快速开始

### 1. 启动服务端

```bash
cd SocketServer
dotnet run
```

或使用自定义端口：
```bash
dotnet run -- 9999
```

服务端启动后，可使用以下命令：
- `help` - 显示帮助
- `status` - 显示服务器状态
- `clients` - 显示已连接客户端
- `sessions` - 显示活动推演会话
- `exit` - 退出服务器

### 2. Unity 客户端设置

1. 打开 Unity Hub，添加项目 `UnityClient` 文件夹
2. 导入 SQLite 插件到 `Assets/Plugins` 目录
3. 创建初始场景，添加以下 GameObject：
   - GameManager (添加 GameManager 脚本)
4. 配置服务器地址和端口
5. 运行场景

### 3. 操作说明

**本地模式 (默认):**
1. 点击"选择车间"加载车间场景
2. 点击"开始推演"启动故障模拟
3. 按空格键可快速注入测试故障
4. 点击故障面板可查看和解决活动故障

**网络模式:**
1. 输入服务器地址和端口
2. 输入玩家名称
3. 点击"连接服务器"
4. 多人联机进行故障推演

## 协议说明

### 消息类型

| 消息类型 | 说明 |
|---------|------|
| ConnectRequest | 连接请求 |
| ConnectResponse | 连接响应 |
| SimulationStartRequest | 开始推演请求 |
| SimulationStopRequest | 停止推演请求 |
| FaultInjectRequest | 注入故障请求 |
| FaultResolveRequest | 解决故障请求 |
| EquipmentStatusNotify | 设备状态通知 |
| FaultOccurredNotify | 故障发生通知 |
| SimulationSyncNotify | 推演同步通知 |
| Heartbeat | 心跳包 |

## 依赖项

### 客户端
- Unity 2021.3 或更高版本
- System.Data.SQLite
- System.Text.Json

### 服务端
- .NET 6.0 或更高版本

## 技术栈

- **客户端**: Unity + C#
- **服务端**: .NET 6.0 + TCP Socket
- **数据库**: SQLite
- **序列化**: System.Text.Json

## 默认数据

### 默认车间
- 一号车间：主生产车间（泵、电机、压缩机）
- 二号车间：辅助车间（传送带、锅炉、阀门）

### 默认故障定义
- PUMP_001: 泵轴承故障
- MOTOR_001: 电机过载
- COMP_001: 压缩机压力异常
- VALVE_001: 阀门泄漏
- SENSOR_001: 传感器漂移

## 扩展开发

### 添加新设备类型
1. 在 `EquipmentTypes.cs` 中继承 `EquipmentBase`
2. 实现 `InitializeParameters()` 和 `SimulateParameters()`
3. 在 `EquipmentType` 枚举中添加新类型
4. 在 `EquipmentManager` 中注册新组件

### 添加新故障类型
1. 在数据库 `fault_definitions` 表中插入故障定义
2. 或在 `SQLiteManager` 的 `InsertDefaultFaultDefinitions()` 中添加

### 扩展网络协议
1. 在 `MessageType` 枚举中添加新消息类型
2. 在客户端和服务端分别添加处理逻辑

## 注意事项

1. 使用前请确保已安装 SQLite 相关插件
2. 网络模式需要先启动服务端
3. 数据库文件存储在 Unity 的 persistentDataPath 目录下
4. 多人联机时请确保网络连通性

## License

MIT License
