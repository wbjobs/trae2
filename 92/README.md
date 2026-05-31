# 物联网边缘网关协议适配统一API服务

基于 Java SpringCloud 开发的物联网边缘网关协议适配统一API服务，支持多协议接入、集群部署、设备状态管理、离线消息缓存等功能。

## 项目架构

```
iot-gateway
├── iot-gateway-common          # 公共模块
│   ├── enums                   # 枚举定义
│   ├── constants               # 常量定义
│   ├── model                   # 数据模型
│   └── feign                   # Feign接口
├── iot-gateway-protocol        # 协议适配模块
│   ├── modbus                  # Modbus协议适配
│   ├── lora                    # LoRa协议适配
│   └── custom                  # 自定义私有协议
├── iot-gateway-session         # 设备会话管理模块
├── iot-gateway-codec           # 消息编解码模块
├── iot-gateway-router          # 路由分发模块
├── iot-gateway-cache           # 离线消息缓存模块
├── iot-gateway-persistence     # 数据库持久化模块
├── iot-gateway-api             # 统一API服务
└── iot-gateway-gateway         # API网关
```

## 核心功能

### 1. 协议适配
- **Modbus TCP/RTU**: 工业设备标准协议
- **LoRa**: 低功耗广域网协议
- **自定义私有协议**: 可扩展的自定义协议框架

### 2. 设备会话管理
- 设备上下线状态实时管理
- 会话池管理（本地+Redis分布式）
- 心跳检测机制

### 3. 消息编解码
- 统一消息格式定义
- 多协议转换
- 可扩展编解码接口

### 4. 路由分发
- 一致性哈希负载均衡
- 跨实例服务调用
- 集群多实例调度

### 5. 离线消息缓存
- Redis消息队列
- 设备上线自动补发
- QoS消息质量保证

### 6. 数据库持久化
- 全量设备数据存储（MySQL）
- 设备信息管理
- 命令执行日志

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Spring Boot | 2.7.18 | 基础框架 |
| Spring Cloud | 2021.0.8 | 微服务框架 |
| Spring Cloud Alibaba | 2021.0.5.0 | 阿里微服务组件 |
| Nacos | 2.x | 服务注册发现 |
| MyBatis-Plus | 3.5.5 | ORM框架 |
| MySQL | 8.x | 关系型数据库 |
| Redis | 6.x+ | 缓存/消息队列 |
| Redisson | 3.24.3 | Redis客户端 |
| Netty | 4.1.100 | 网络通信框架 |
| Hutool | 5.8.24 | 工具类库 |
| FastJSON2 | 2.0.43 | JSON处理 |

## 快速开始

### 环境要求
- JDK 1.8+
- Maven 3.6+
- MySQL 8.x
- Redis 6.x+
- Nacos 2.x

### 数据库初始化

```sql
source iot-gateway-persistence/src/main/resources/sql/init.sql
```

### 配置修改

修改各模块的 `application.yml` 配置文件：

1. Nacos服务地址
2. MySQL数据库连接
3. Redis连接信息
4. 协议端口配置

### 编译打包

```bash
mvn clean package -DskipTests
```

### 启动服务

1. 启动Nacos服务
2. 启动MySQL和Redis
3. 启动API服务:
   ```bash
   java -jar iot-gateway-api/target/iot-gateway-api-1.0.0.jar
   ```
4. 启动网关服务:
   ```bash
   java -jar iot-gateway-gateway/target/iot-gateway-gateway-1.0.0.jar
   ```

## API接口

### 设备会话管理

| 接口 | 方法 | 说明 |
|------|------|------|
| /session/{deviceId} | GET | 获取设备会话 |
| /session/online | POST | 设备上线 |
| /session/offline/{deviceId} | POST | 设备离线 |
| /session/list | GET | 获取在线设备列表 |
| /session/online/{deviceId} | GET | 检查设备是否在线 |

### 消息管理

| 接口 | 方法 | 说明 |
|------|------|------|
| /message/send | POST | 发送消息 |
| /message/command | POST | 发送命令 |
| /message/report | POST | 上报数据 |
| /message/offline/{deviceId} | GET | 获取离线消息 |
| /message/offline/clear/{deviceId} | POST | 清除离线消息 |

## 集群部署

### 多实例部署

1. 部署多个 `iot-gateway-api` 实例
2. 配置不同端口
3. Nacos自动完成服务注册

### 负载均衡

- 基于一致性哈希的设备路由
- 同一设备始终路由到同一实例
- 实例上下线自动重平衡

### 跨实例调用

- OpenFeign远程调用
- 基于设备ID的路由选择
- 支持跨协议服务调用

## 扩展开发

### 添加新协议

1. 实现 `MessageCodec` 接口，完成编解码
2. 实现 `ProtocolAdapter` 接口，完成协议适配
3. 编解码器加入 `MessageCodecFactory`
4. 适配器自动被Spring扫描

### 自定义消息处理

1. 监听设备状态变化事件
2. 实现消息拦截器
3. 扩展统一消息格式

## 性能优化

- Netty线程模型优化
- 异步数据持久化
- Redis管道批量操作
- 数据库连接池配置

## License

MIT License
