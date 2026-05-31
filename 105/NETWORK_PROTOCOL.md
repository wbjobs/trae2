# 矿山井下设备应急处置实训系统 - 网络通信协议

## 1. 协议概述

本协议基于 TCP Socket 实现，采用 JSON 格式进行数据交换，用于多人联机模式下客户端与服务端之间的实时通信。

- 传输协议：TCP
- 数据格式：JSON (UTF-8 编码)
- 消息分隔符：换行符 `\n`
- 默认端口：8080

## 2. 消息结构

### 2.1 通用消息格式

```json
{
    "type": "message_type",
    "data": {
        // 消息具体数据
    },
    "timestamp": 1714567890123
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | String | 消息类型标识符 |
| `data` | Object | 消息负载数据 |
| `timestamp` | Number | 消息发送时间戳（毫秒） |

### 2.2 消息类型枚举

| 类型值 | 说明 | 方向 |
|--------|------|------|
| `connect` | 客户端连接请求 | C → S |
| `disconnect` | 断开连接通知 | C ↔ S |
| `heartbeat` | 心跳包 | C ↔ S |
| `fault` | 故障触发通知 | S → C |
| `operation` | 操作执行通知 | C ↔ S |
| `sync` | 数据同步 | C ↔ S |
| `training_start` | 训练开始通知 | S → C |
| `training_result` | 训练结果通知 | S → C |
| `chat` | 聊天消息 | C ↔ S |
| `player_list` | 玩家列表更新 | S → C |

## 3. 消息详情

### 3.1 连接请求 (connect)

**方向**: 客户端 → 服务端

```json
{
    "type": "connect",
    "data": {
        "player_id": "player_1234567890",
        "player_name": "张三"
    },
    "timestamp": 1714567890123
}
```

**响应**: 服务端向所有客户端广播 `player_list` 更新

### 3.2 断开连接 (disconnect)

**方向**: 客户端 → 服务端 / 服务端 → 客户端

```json
{
    "type": "disconnect",
    "data": {
        "player_id": "player_1234567890"
    },
    "timestamp": 1714567890123
}
```

### 3.3 心跳包 (heartbeat)

**方向**: 双向

```json
{
    "type": "heartbeat",
    "data": {
        "player_id": "player_1234567890",
        "status": "alive"
    },
    "timestamp": 1714567890123
}
```

**说明**: 建议每 30 秒发送一次，超时 60 秒视为离线

### 3.4 故障触发 (fault)

**方向**: 服务端 → 所有客户端

```json
{
    "type": "fault",
    "data": {
        "equipment_id": "pump_001",
        "fault_type": "overheat",
        "fault_name": "设备过热",
        "severity": "high",
        "description": "设备温度异常升高",
        "time_limit": 120.0
    },
    "timestamp": 1714567890123
}
```

### 3.5 操作执行 (operation)

**方向**: 双向

```json
{
    "type": "operation",
    "data": {
        "player_id": "player_1234567890",
        "operation": {
            "operation_id": "press_emergency_stop",
            "step_index": 0,
            "correct": true,
            "time_spent": 5.5,
            "score": 15
        }
    },
    "timestamp": 1714567890123
}
```

**说明**: 客户端执行操作后发送给服务端，服务端验证后广播给所有客户端

### 3.6 数据同步 (sync)

**方向**: 双向

```json
{
    "type": "sync",
    "data": {
        "sync_type": "position",
        "data": {
            "player_id": "player_1234567890",
            "position": {"x": 5.0, "y": 1.0, "z": 0.0},
            "rotation": {"x": 0.0, "y": 1.57, "z": 0.0}
        }
    },
    "timestamp": 1714567890123
}
```

**同步类型**:
- `position`: 玩家位置同步
- `interaction`: 设备交互通知
- `equipment_state`: 设备状态更新

### 3.7 训练开始 (training_start)

**方向**: 服务端 → 所有客户端

```json
{
    "type": "training_start",
    "data": {
        "timestamp": 1714567890123,
        "difficulty": "normal",
        "max_active_faults": 2
    },
    "timestamp": 1714567890123
}
```

### 3.8 训练结果 (training_result)

**方向**: 服务端 → 所有客户端

```json
{
    "type": "training_result",
    "data": {
        "success": true,
        "score": 85,
        "max_score": 100,
        "time_spent": 85.5,
        "mistakes": 1,
        "steps_completed": 8,
        "total_steps": 8
    },
    "timestamp": 1714567890123
}
```

### 3.9 玩家列表 (player_list)

**方向**: 服务端 → 所有客户端

```json
{
    "type": "player_list",
    "data": {
        "players": [
            {
                "id": "server_1234567890",
                "name": "主机",
                "is_host": true
            },
            {
                "id": "player_1234567891",
                "name": "张三",
                "is_host": false
            }
        ]
    },
    "timestamp": 1714567890123
}
```

**说明**: 玩家加入/离开时自动广播

## 4. 连接流程

### 4.1 服务端启动流程

```
1. 服务端监听指定端口 (默认 8080)
2. 等待客户端连接
3. 接受连接后分配临时 ID
4. 等待客户端发送 connect 消息
5. 验证 connect 消息，注册玩家
6. 向所有客户端广播更新 player_list
```

### 4.2 客户端连接流程

```
1. 连接到服务器地址和端口
2. 发送 connect 消息 (包含 player_id 和 player_name)
3. 等待服务端确认 (接收 player_list 消息)
4. 开始发送心跳包 (每 30 秒)
5. 同步游戏状态
```

## 5. 故障类型定义

| 故障类型 ID | 名称 | 严重程度 | 时限(秒) |
|-------------|------|----------|----------|
| `overheat` | 设备过热 | high | 120 |
| `leak` | 管道泄漏 | medium | 180 |
| `power_failure` | 电力故障 | critical | 90 |
| `mechanical_failure` | 机械故障 | high | 150 |
| `control_failure` | 控制故障 | medium | 120 |
| `ventilation_failure` | 通风故障 | critical | 60 |
| `pump_failure` | 水泵故障 | high | 100 |
| `conveyor_jam` | 输送机卡滞 | medium | 150 |

## 6. 操作 ID 定义

### 6.1 通用操作

| 操作 ID | 名称 |
|---------|------|
| `press_emergency_stop` | 按下紧急停止按钮 |
| `cut_power` | 切断主电源 |
| `warn_personnel` | 警示周边人员 |
| `evacuate_area` | 疏散作业区域 |
| `call_dispatch` | 呼叫调度室 |
| `report_status` | 汇报当前状态 |
| `set_warning_sign` | 设置警示标志 |
| `isolate_area` | 隔离危险区域 |
| `confirm_safe` | 确认安全 |

### 6.2 电力故障相关

| 操作 ID | 名称 |
|---------|------|
| `turn_on_headlamp` | 打开头灯 |
| `stay_calm` | 保持冷静 |
| `stop_machines` | 停止运转设备 |
| `check_switch_gear` | 检查开关柜 |
| `inspect_cables` | 检查电缆 |
| `start_generator` | 启动发电机 |
| `activate_ups` | 启动UPS |
| `guide_evacuation` | 引导人员撤离 |
| `check_exit` | 确认安全出口 |
| `report_blackout` | 上报停电情况 |
| `headcount` | 清点人数 |
| `confirm_all_safe` | 确认全员安全 |

### 6.3 通风故障相关

| 操作 ID | 名称 |
|---------|------|
| `trigger_gas_alarm` | 触发瓦斯警报 |
| `shout_warning` | 大声呼喊警示 |
| `stop_all_work` | 停止所有作业 |
| `notify_workers` | 通知作业人员 |
| `measure_gas` | 检测瓦斯浓度 |
| `read_detector` | 读取检测仪 |
| `evacuate_to_intake` | 撤离至进风巷 |
| `lead_escape` | 带领人员逃生 |
| `call_rescue` | 呼叫救护队 |
| `report_emergency` | 上报紧急情况 |
| `close_damper` | 关闭风门 |
| `seal_area` | 封闭区域 |

### 6.4 泄漏故障相关

| 操作 ID | 名称 |
|---------|------|
| `locate_leak` | 查找泄漏点 |
| `identify_fluid` | 确认泄漏介质 |
| `close_valve` | 关闭阀门 |
| `shut_off_supply` | 切断供应 |
| `open_relief_valve` | 开启泄压阀 |
| `depressurize` | 释放压力 |
| `contain_spill` | 围堵泄漏物 |
| `use_absorbent` | 使用吸附材料 |
| `set_slippery_sign` | 设置防滑标志 |
| `warn_others` | 警告他人 |
| `apply_patch` | 粘贴堵漏片 |
| `use_clamp` | 使用管箍 |
| `call_maintenance` | 呼叫维修人员 |
| `report_leak` | 上报泄漏情况 |

## 7. 错误处理

### 7.1 连接错误

- 端口占用：服务端返回 "端口已被占用"
- 连接超时：客户端提示 "连接超时，请检查网络"
- 拒绝连接：服务端已满或已关闭

### 7.2 消息格式错误

收到无效 JSON 或缺少必要字段时，记录日志并忽略该消息。

### 7.3 重连机制

客户端意外断开后，30 秒内重新连接可恢复会话（可选实现）。

## 8. 安全建议

1. 生产环境建议使用 TLS 加密通信
2. 对玩家输入进行合法性验证
3. 记录所有操作日志用于审计
4. 实现反作弊机制（操作时间间隔检查等）
