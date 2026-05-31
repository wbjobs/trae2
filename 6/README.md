# Ethereum Contract Listener Service

一个模块化的以太坊合约事件监听服务，支持链上事件监听、解析、数据持久化和告警推送。

## 功能特性

- **链上监听模块**：支持多合约事件监听，可配置区块确认数和轮询间隔
- **并发优化**：多合约并发请求，可配置并发数，动态调整区块范围
- **事件解析模块**：自动解析事件日志，支持自定义事件处理器
- **数据入库模块**：MongoDB 持久化存储，自动去重
- **告警推送模块**：支持 Slack Webhook 告警推送，支持自定义告警规则
- **规则引擎**：支持金额阈值、地址黑白名单、事件名、自定义函数等多类型告警规则
- **Redis 缓存**：区块高度和事件处理状态缓存，支持断点续传
- **模块化架构**：多文件设计，易于扩展和维护

## 项目结构

```
.
├── index.js              # 主服务入口
├── config.js             # 配置文件
├── cache.js              # Redis 缓存模块
├── blockchain-listener.js # 链上监听模块
├── event-parser.js       # 事件解析模块
├── database.js           # 数据入库模块
├── alert-pusher.js       # 告警推送模块
├── alert-rules.js        # 告警规则引擎
├── package.json          # 项目依赖
├── .env.example          # 环境变量示例
└── README.md             # 项目文档
```

## 快速开始

### 环境要求

- Node.js >= 16.x
- Redis >= 5.x
- MongoDB >= 4.x

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

### 启动服务

```bash
npm start
```

开发模式（自动重启）：

```bash
npm run dev
```

## 配置说明

### 区块链配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `ETH_RPC_URL` | Ethereum RPC 节点地址 | `https://mainnet.infura.io/v3/your-infura-key` |
| `START_BLOCK` | 起始监听区块高度 | `0` |
| `CONFIRMATIONS` | 区块确认数 | `12` |
| `POLL_INTERVAL` | 轮询间隔（毫秒） | `15000` |
| `MAX_BLOCK_RANGE` | 单次查询最大区块范围 | `5000` |
| `CONCURRENCY` | 多合约并发请求数 | `3` |

### Redis 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `REDIS_HOST` | Redis 主机地址 | `127.0.0.1` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `REDIS_PASSWORD` | Redis 密码 | （空） |
| `REDIS_DB` | Redis 数据库编号 | `0` |
| `REDIS_PREFIX` | Redis Key 前缀 | `eth_listener:` |

### 数据库配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `MONGODB_URI` | MongoDB 连接 URI | `mongodb://localhost:27017/eth_events` |

### 合约配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `CONTRACT_ADDRESSES` | 要监听的合约地址列表，用逗号分隔 | （空） |

### 告警配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `ALERT_WEBHOOK_URL` | Slack Webhook URL | （空） |
| `ALERT_ENABLED` | 是否启用告警 | `false` |
| `ALERT_EVENTS` | 传统模式下需要告警的事件名称，用逗号分隔 | （空） |
| `USE_LEGACY_ALERT` | 使用传统事件名匹配模式（禁用规则引擎） | `false` |
| `ALERT_RATE_LIMIT` | 每分钟告警频率限制 | `10` |

## 模块说明

### 1. 链上监听模块 (blockchain-listener.js)

负责监听区块链上的合约事件：

- 轮询新区块，支持可配置确认数
- 支持多合约同时监听
- **并发请求**：多合约并行查询，可配置并发数
- **动态范围调整**：遇到 `Log response size exceeded` 自动二分缩小范围
- **失败重试**：最多重试 3 次，指数退避延迟
- **性能统计**：记录查询耗时和事件数量

关键代码：
- `fetchPastEventsConcurrent()` (`blockchain-listener.js:88`) - 并发 worker 池实现
- `fetchPastEventsForContract()` (`blockchain-listener.js:38`) - 单合约分块查询

### 2. 事件解析模块 (event-parser.js)

负责解析原始事件日志：

- 生成唯一事件 ID
- 标准化返回值（处理 BigInt 等类型）
- 支持注册自定义事件处理器
- 安全的 JSON 序列化（处理 BigInt）

### 3. 数据入库模块 (database.js)

负责将解析后的事件存入数据库：

- MongoDB 存储
- 自动去重（基于 eventId 和唯一索引）
- 提供多种查询接口

### 4. 告警推送模块 (alert-pusher.js)

负责推送告警通知：

- Slack Webhook 集成
- 支持告警规则引擎
- 可配置告警事件类型
- 支持自定义消息格式
- **频率限制**：每分钟最多 10 条告警，防止消息轰炸
- **告警等级**：critical / high / warning / info / low，带对应 emoji

### 5. 告警规则引擎 (alert-rules.js)

灵活的告警规则引擎，支持多种规则类型：

#### 规则类型

**1. 金额阈值 (amountThreshold)**

```javascript
alerter.addRule('large_transfer', {
  type: 'amountThreshold',
  enabled: true,
  severity: 'warning',
  description: 'Transfer >= 10000 tokens',
  condition: {
    field: 'returnValues.value',  // 要检查的字段路径
    min: 10000,                   // 最小值（包含）
    max: 1000000,                 // 最大值（包含，可选）
    decimals: 18,                 // 小数位数，用于 bigint 转 number
  },
  messageTemplate: '💰 Large Transfer: {{returnValues.value}} tokens',
});
```

**2. 地址黑白名单 (address)**

```javascript
alerter.addRule('whale_activity', {
  type: 'address',
  enabled: true,
  severity: 'high',
  description: 'Whale address activity',
  condition: {
    fields: ['returnValues.from', 'returnValues.to'],  // 检查的字段
    whitelist: ['0xWhaleAddress1', '0xWhaleAddress2'], // 白名单
    blacklist: [],                                      // 黑名单
  },
});
```

**3. 事件名匹配 (eventName)**

```javascript
alerter.addRule('specific_events', {
  type: 'eventName',
  enabled: true,
  severity: 'info',
  condition: {
    eventNames: ['Transfer', 'Swap'],  // 告警的事件名
    exclude: ['Approval'],             // 排除的事件名（可选）
  },
});
```

**4. 合约筛选 (contract)**

```javascript
alerter.addRule('defi_contracts', {
  type: 'contract',
  enabled: true,
  severity: 'info',
  condition: {
    contracts: ['0xUniswapV3', '0xAAVE'], // 只告警这些合约的事件
  },
});
```

**5. 自定义规则 (custom)**

```javascript
alerter.addRule('custom_rule', {
  type: 'custom',
  enabled: true,
  severity: 'critical',
  condition: {
    evaluate: (event) => {
      const value = parseFloat(event.returnValues.value);
      const from = event.returnValues.from?.toLowerCase();
      return value > 100000 && from === '0xSuspiciousAddress';
    },
  },
  messageTemplate: '🚨 Suspicious large transfer detected!',
});
```

#### 默认规则

服务启动时自动加载以下默认规则（可通过代码禁用或修改）：

| 规则名 | 类型 | 说明 |
|--------|------|------|
| `large_transfer` | amountThreshold | Transfer >= 1000 tokens |
| `whale_address` | address | 大额地址活动 |
| `all_events` | eventName | 所有事件（默认禁用） |

#### 消息模板

支持使用 `{{变量名}}` 语法自定义消息模板：

- `{{eventName}}` - 事件名
- `{{contractAddress}}` - 合约地址
- `{{blockNumber}}` - 区块号
- `{{transactionHash}}` - 交易哈希
- `{{returnValues.字段名}}` - 事件返回值

### 6. Redis 缓存模块 (cache.js)

负责缓存区块高度和事件状态：

- 记录最后处理的区块高度
- 事件去重缓存（7 天过期）
- 支持服务重启后断点续传

## 自定义扩展

### 添加新合约

方式一：通过环境变量 `CONTRACT_ADDRESSES=0xAddr1,0xAddr2`

方式二：在 `index.js` 的 `CONTRACT_CONFIGS` 中配置：

```javascript
const CONTRACT_CONFIGS = [
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    name: 'USDC',
    abi: ERC20_ABI,
  },
  {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    name: 'USDT',
    abi: ERC20_ABI,
  },
];
```

方式三：调用 API：

```javascript
service.addContract('0xContractAddress', contractABI, 'ContractName');
```

### 注册自定义事件处理器

```javascript
service.registerEventHandler('Transfer', async (event) => {
  console.log('Custom handler:', event);
});
```

### 添加自定义告警规则

```javascript
service.addAlertRule('my_custom_rule', {
  type: 'amountThreshold',
  enabled: true,
  severity: 'high',
  description: 'Transfer > 100 ETH',
  condition: {
    field: 'returnValues.value',
    min: 100,
    decimals: 18,
  },
  messageTemplate: '💸 Big transfer: {{returnValues.value}} ETH',
});
```

### 查看已注册的告警规则

```javascript
const rules = service.listAlertRules();
console.log(rules);
```

### 使用模块 API

```javascript
const { ContractListenerService } = require('./index');

const service = new ContractListenerService();

// 启动服务
await service.start();

// 停止服务
await service.stop();
```

## 数据库查询示例

```javascript
// 获取指定合约的事件
const events = await database.getEventsByContract('0x...', 100);

// 获取指定事件类型
const transfers = await database.getEventsByEventName('Transfer', 50);

// 获取区块范围的事件
const rangeEvents = await database.getEventsByBlockRange(1000000, 1000100);
```

## 性能优化建议

1. **调整并发数**：根据 RPC 节点能力调整 `CONCURRENCY`，通常 3-5 比较合适
2. **调整区块范围**：事件密集的合约可降低 `MAX_BLOCK_RANGE`，稀疏的可提高
3. **确认数配置**：主网建议 12，测试网可降低
4. **轮询间隔**：主网出块约 12s，设置 15s 比较合理

## 注意事项

1. 确保 RPC 节点稳定可靠，建议使用付费节点服务（Infura / Alchemy）
2. 根据实际需求调整 `CONFIRMATIONS` 参数
3. 监听多合约时注意 RPC 调用频率限制
4. 定期清理 Redis 缓存和数据库历史数据
5. 告警频率限制可防止消息轰炸，可根据需要调整

## License

MIT
