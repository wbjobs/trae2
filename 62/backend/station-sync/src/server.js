const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const cron = require('node-cron');
const { nodeManager, NodeType, NodeStatus } = require('./nodes');
const { syncEngine, SyncOperation } = require('./sync');
const syncRoutes = require('./routes/sync');

const app = express();
const PORT = 3003;

// ========== 中间件配置 ==========

// CORS 配置：允许所有来源
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON 请求体解析
app.use(express.json({ limit: '10mb' }));

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ========== REST 路由 ==========

app.use('/api', syncRoutes);

app.get('/health', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      service: 'station-sync',
      version: '2.0.0',
      status: 'running',
      port: PORT,
      uptime: process.uptime(),
      timestamp: Date.now(),
    },
  });
});

// 根路由
app.get('/', (req, res) => {
  res.json({
    service: '车站节点同步服务',
    version: '1.0.0',
    description: '车-站-中心跨服务数据交互服务',
    endpoints: {
      health: '/health',
      nodes: '/api/nodes',
      syncStatus: '/api/sync/status',
      syncPush: '/api/sync/push',
      syncPull: '/api/sync/pull',
      websocket: `ws://localhost:${PORT}`
    },
    docs: '车站节点同步服务 - 支持车载终端、车站节点、运营中心三层数据同步'
  });
});

// ========== HTTP 服务器 & WebSocket ==========

const server = http.createServer(app);

// WebSocket 服务端
const wss = new WebSocketServer({ server });

// 存储模拟的节点 ID（用于定时模拟数据同步）
const simulatedNodes = {
  stations: [],
  onboardTerminals: [],
  occCenter: null
};

// ========== WebSocket 事件处理 ==========

wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).substring(2, 10);
  console.log(`[WebSocket] 客户端已连接: ${clientId} (${req.socket.remoteAddress})`);

  // 注册到节点管理器
  nodeManager.registerWsClient(ws);

  // 向新客户端发送欢迎消息
  ws.send(JSON.stringify({
    type: 'welcome',
    data: {
      message: '欢迎连接车站节点同步服务',
      clientId,
      serverTime: Date.now(),
      availableEvents: [
        'node:online',
        'node:offline',
        'node:status_change',
        'nodes:full',
        'sync:progress'
      ]
    },
    timestamp: Date.now()
  }));

  // 处理客户端消息
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[WebSocket] 收到消息 (${clientId}): ${message.type || 'unknown'}`);

      // 客户端可以请求全量节点状态
      if (message.type === 'request:nodes') {
        ws.send(JSON.stringify({
          type: 'nodes:full',
          data: nodeManager.getAllNodes(),
          timestamp: Date.now()
        }));
      }

      // 客户端可以请求同步状态
      if (message.type === 'request:sync_status') {
        ws.send(JSON.stringify({
          type: 'sync:status',
          data: syncEngine.getSyncStatus(),
          timestamp: Date.now()
        }));
      }

      // 客户端可以模拟心跳
      if (message.type === 'heartbeat' && message.nodeId) {
        nodeManager.heartbeat(message.nodeId);
      }
    } catch (err) {
      console.error(`[WebSocket] 消息解析错误 (${clientId}):`, err.message);
    }
  });

  // 客户端断开连接
  ws.on('close', () => {
    console.log(`[WebSocket] 客户端已断开: ${clientId}`);
    nodeManager.unregisterWsClient(ws);
  });

  // WebSocket 错误
  ws.on('error', (err) => {
    console.error(`[WebSocket] 错误 (${clientId}):`, err.message);
    nodeManager.unregisterWsClient(ws);
  });
});

// ========== 模拟节点生成 ==========

/**
 * 模拟生成所有节点：5个车站、3个车载终端、1个运营中心
 */
function createSimulatedNodes() {
  console.log('\n========== 生成模拟节点 ==========\n');

  // 1. 生成 1 个运营中心节点
  const occNode = nodeManager.register({
    type: NodeType.OCC_CENTER,
    name: '运营中心-OCC-01',
    description: '城市轨道交通运营控制中心',
    ip: '10.0.0.100',
    port: 8080,
    metadata: {
      location: '总部大楼',
      coverage: '全市',
      capacity: 100000
    }
  });
  simulatedNodes.occCenter = occNode;
  console.log(`[生成] 运营中心: ${occNode.name} (${occNode.id})`);

  // 2. 生成 5 个车站节点
  const stationNames = ['中央车站', '人民广场站', '科技园站', '大学城站', '机场站'];
  const stationDescriptions = [
    '1号线与2号线换乘站，日均客流15万',
    '2号线核心站，紧邻商业中心',
    '3号线终点，紧邻科技园区',
    '4号线站点，服务3所大学',
    '3号线与机场线换乘站'
  ];

  for (let i = 0; i < 5; i++) {
    const station = nodeManager.register({
      type: NodeType.STATION_NODE,
      name: `车站-${stationNames[i]}`,
      description: stationDescriptions[i],
      ip: `10.0.1.${10 + i}`,
      port: 8081 + i,
      metadata: {
        line: ['1号线', '2号线', '3号线', '4号线', '5号线'][i],
        platformCount: 2 + (i % 2),
        trainCapacity: 200 + i * 50,
        zone: `区域-${i + 1}`
      }
    });
    simulatedNodes.stations.push(station);
    console.log(`[生成] 车站节点: ${station.name} (${station.id})`);
  }

  // 3. 生成 3 个车载终端节点
  const terminalNames = ['列车-01', '列车-02', '列车-03'];
  const terminalMetadata = [
    { line: '1号线', trainModel: 'A型车', capacity: 1800, currentStation: '中央车站' },
    { line: '2号线', trainModel: 'B型车', capacity: 1200, currentStation: '人民广场站' },
    { line: '3号线', trainModel: 'A型车', capacity: 1800, currentStation: '科技园站' }
  ];

  for (let i = 0; i < 3; i++) {
    const terminal = nodeManager.register({
      type: NodeType.ONBOARD_TERMINAL,
      name: `车载终端-${terminalNames[i]}`,
      description: `${terminalMetadata[i].line} ${terminalNames[i]} 车载数据终端`,
      ip: `10.0.2.${20 + i}`,
      port: 9000 + i,
      metadata: terminalMetadata[i]
    });
    simulatedNodes.onboardTerminals.push(terminal);
    console.log(`[生成] 车载终端: ${terminal.name} (${terminal.id})`);
  }

  console.log('\n========== 模拟节点生成完成 ==========\n');
}

// ========== 模拟跨节点数据同步 ==========

/**
 * 模拟数据同步流程：演示三层节点间的数据交互
 */
async function simulateDataSync() {
  console.log('\n========== 开始模拟跨节点数据同步 ==========\n');

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // 场景 1：车载终端 → 车站节点 → 运营中心 上报数据
  console.log('--- 场景 1: 车载终端上报实时数据 ---');

  for (let i = 0; i < simulatedNodes.onboardTerminals.length; i++) {
    const terminal = simulatedNodes.onboardTerminals[i];
    const result = await syncEngine.syncToDownstream(terminal.id, {
      dataKey: `train:${terminal.metadata.line}:${terminal.name.split('-')[1]}:status`,
      dataValue: {
        trainId: terminal.name,
        line: terminal.metadata.line,
        speed: 60 + Math.random() * 20,
        location: terminal.metadata.currentStation,
        passengers: Math.floor(800 + Math.random() * 600),
        doorStatus: 'closed',
        timestamp: Date.now()
      },
      operation: SyncOperation.UPDATE,
      metadata: { source: 'onboard_terminal', priority: 'high' }
    });
    console.log(`[同步] ${terminal.name} → 下游节点 (成功: ${result.syncedCount}, 失败: ${result.failedCount})`);
    await wait(300);
  }

  // 场景 2：车站节点 → 车载终端 广播调度指令
  console.log('\n--- 场景 2: 车站节点广播调度指令 ---');

  for (let i = 0; i < Math.min(3, simulatedNodes.stations.length); i++) {
    const station = simulatedNodes.stations[i];
    const result = await syncEngine.syncToDownstream(station.id, {
      dataKey: `station:${station.name}:dispatch:order`,
      dataValue: {
        stationId: station.name,
        orderType: 'departure',
        targetPlatform: station.metadata.platformCount > 2 ? '3号站台' : '1号站台',
        departureTime: new Date(Date.now() + 60000).toISOString(),
        trainLine: station.metadata.line,
        instruction: '按计划发车，注意安全'
      },
      operation: SyncOperation.UPDATE,
      metadata: { source: 'station_node', priority: 'normal' }
    });
    console.log(`[同步] ${station.name} → 下游车载终端 (成功: ${result.syncedCount}, 失败: ${result.failedCount})`);
    await wait(300);
  }

  // 场景 3：运营中心 → 车站 + 车载 广播全局公告
  console.log('\n--- 场景 3: 运营中心广播全局公告 ---');

  if (simulatedNodes.occCenter) {
    const result = await syncEngine.syncToDownstream(simulatedNodes.occCenter.id, {
      dataKey: 'occ:global:announcement',
      dataValue: {
        type: 'announcement',
        title: '系统运行正常',
        content: '当前全线网运营正常，各站列车按计划运行',
        level: 'info',
        from: 'OCC-01',
        effectiveTime: Date.now()
      },
      operation: SyncOperation.UPDATE,
      metadata: { source: 'occ_center', priority: 'critical', broadcast: true }
    });
    console.log(`[同步] 运营中心 → 全网络 (成功: ${result.syncedCount}, 失败: ${result.failedCount})`);
  }

  // 场景 4：模拟冲突解决 - 车站和车载同时更新同一数据
  console.log('\n--- 场景 4: 冲突解决演示 ---');

  if (simulatedNodes.stations.length > 0 && simulatedNodes.onboardTerminals.length > 0) {
    const sharedKey = 'schedule:train-01:departure_time';

    // 车站先写入
    await syncEngine.pushData(simulatedNodes.stations[0].id, {
      dataKey: sharedKey,
      dataValue: { station: '中央车站', departureTime: '10:30' },
      operation: SyncOperation.UPDATE
    });
    console.log(`[冲突] 车站写入: ${sharedKey} = 10:30`);

    // 车载终端后写入同一键（触发冲突，按源头优先级策略，车站优先）
    const conflictResult = await syncEngine.pushData(simulatedNodes.onboardTerminals[0].id, {
      dataKey: sharedKey,
      dataValue: { station: '中央车站', departureTime: '10:45' },
      operation: SyncOperation.UPDATE
    });
    console.log(`[冲突] 车载终端写入: ${sharedKey} = 10:45`);
    console.log(`[冲突] 冲突解决结果: ${conflictResult.success ? '已更新' : '已忽略（优先级不足）'}`);
    if (!conflictResult.success && conflictResult.conflictDetail) {
      console.log(`[冲突] 策略: ${conflictResult.conflictDetail.strategy}`);
    }
  }

  // 场景 5：模拟节点断线重连
  console.log('\n--- 场景 5: 断线重连演示 ---');

  if (simulatedNodes.onboardTerminals.length > 0) {
    const terminal = simulatedNodes.onboardTerminals[0];
    console.log(`[重连] ${terminal.name} 当前状态: ${nodeManager.nodes.get(terminal.id).status}`);

    // 模拟断线
    nodeManager.updateStatus(terminal.id, NodeStatus.OFFLINE);
    console.log(`[重连] ${terminal.name} 模拟断线，状态: ${nodeManager.nodes.get(terminal.id).status}`);

    await wait(1000);

    // 模拟重连
    nodeManager.heartbeat(terminal.id);
    console.log(`[重连] ${terminal.name} 心跳恢复，状态: ${nodeManager.nodes.get(terminal.id).status}`);

    // 重连后执行增量同步
    const incrementalResult = await syncEngine.incrementalSync(terminal.id);
    console.log(`[重连] 增量同步完成，拉取 ${incrementalResult.pulledCount} 条变更`);
  }

  // 打印最终同步状态
  console.log('\n--- 同步状态概览 ---');
  const status = syncEngine.getSyncStatus();
  console.log(JSON.stringify({
    totalNodes: status.totalNodes,
    onlineCount: status.onlineCount,
    offlineCount: status.offlineCount,
    totalChangesLogged: status.totalChangesLogged,
    totalDataKeys: status.totalDataKeys
  }, null, 2));

  console.log('\n========== 模拟跨节点数据同步完成 ==========\n');
}

// ========== 定时模拟心跳 ==========

/**
 * 启动定时心跳模拟：为所有模拟节点定期发送心跳
 */
function startHeartbeatSimulation() {
  cron.schedule('*/3 * * * * *', () => {
    // 为所有模拟节点发送心跳
    const allSimulated = [
      ...simulatedNodes.stations,
      ...simulatedNodes.onboardTerminals,
      simulatedNodes.occCenter
    ].filter(Boolean);

    for (const node of allSimulated) {
      if (node && nodeManager.nodes.has(node.id)) {
        nodeManager.heartbeat(node.id);
      }
    }
  });
  console.log('[模拟] 定时心跳模拟已启动（每 3 秒）');
}

// ========== 启动服务 ==========

async function startServer() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║      车站节点同步服务 Station-Sync      ║');
  console.log('║   车-站-中心跨服务数据交互服务 v1.0.0   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 生成模拟节点
  createSimulatedNodes();

  // 启动增强版同步引擎
  syncEngine.start();

  // 启动节点管理器定时任务
  nodeManager.startScheduler();

  // 启动定时心跳模拟
  startHeartbeatSimulation();

  // 启动 HTTP 服务器
  server.listen(PORT, () => {
    console.log(`\n[服务] 车站节点同步服务已启动`);
    console.log(`[服务] HTTP 服务: http://localhost:${PORT}`);
    console.log(`[服务] WebSocket: ws://localhost:${PORT}`);
    console.log(`[服务] API 文档:`);
    console.log(`  - GET  /api/nodes              - 获取所有节点列表`);
    console.log(`  - GET  /api/nodes/:id          - 获取节点详情`);
    console.log(`  - POST /api/nodes/:id/heartbeat - 节点心跳`);
    console.log(`  - POST /api/sync/push          - 推送数据`);
    console.log(`  - POST /api/sync/pull          - 拉取数据`);
    console.log(`  - POST /api/sync/broadcast     - 广播数据到下游`);
    console.log(`  - GET  /api/sync/status        - 同步状态概览`);
    console.log(`  - GET  /api/sync/changes       - 变更日志`);
    console.log(`\n[服务] 等待 2 秒后开始模拟跨节点数据同步...\n`);
  });

  // 延迟模拟数据同步（等待 WebSocket 客户端有机会连接）
  setTimeout(async () => {
    try {
      await simulateDataSync();
    } catch (err) {
      console.error('[模拟] 数据同步模拟出错:', err);
    }
  }, 2000);
}

// 优雅关闭
function gracefulShutdown() {
  console.log('\n[服务] 正在关闭服务...');
  nodeManager.stopScheduler();
  server.close(() => {
    console.log('[服务] 服务已关闭');
    process.exit(0);
  });

  // 强制关闭
  setTimeout(() => {
    console.log('[服务] 强制关闭');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// 启动
startServer().catch(err => {
  console.error('[服务] 启动失败:', err);
  process.exit(1);
});