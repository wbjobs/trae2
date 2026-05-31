/**
 * 地铁弱电系统信令接收服务 - 主入口
 * 
 * 功能:
 * - Express HTTP 服务 (端口 3001)
 * - CORS 跨域支持
 * - REST API 路由
 * - WebSocket 实时消息推送
 * - 信令抓取服务
 * - 启动时自动生成模拟数据
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const SignalSniffer = require('./sniffer');

const signalingRoutes = require('./routes/signaling');
const linkRoutes = require('./routes/links');
const stationRoutes = require('./routes/stations');
const { setSniffer: setSignalingSniffer } = require('./routes/signaling');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/signaling', signalingRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/stations', stationRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      service: 'metro-signaling-service',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    },
  });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WebSocket] 新客户端连接');

  ws.send(JSON.stringify({
    type: 'system',
    message: '已连接到信令接收服务',
    timestamp: new Date().toISOString(),
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('[WebSocket] 收到客户端消息:', data);
    } catch (err) {
      console.error('[WebSocket] 消息解析失败:', err);
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] 客户端断开连接');
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] 连接错误:', err);
  });
});

function broadcastToClients(data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

const MOCK_STATIONS = [
  { id: uuidv4(), name: '人民广场站', line: '1号线', level: 1, status: 'online', ip_address: '192.168.10.11' },
  { id: uuidv4(), name: '陆家嘴站', line: '2号线', level: 2, status: 'online', ip_address: '192.168.10.12' },
  { id: uuidv4(), name: '徐家汇站', line: '1号线', level: 1, status: 'online', ip_address: '192.168.10.13' },
  { id: uuidv4(), name: '静安寺站', line: '2号线', level: 2, status: 'online', ip_address: '192.168.10.14' },
  { id: uuidv4(), name: '中山公园站', line: '3号线', level: 2, status: 'online', ip_address: '192.168.10.15' },
];

function generateMockLinks(stations) {
  const linkTypes = ['fiber', 'wireless', 'copper'];
  const links = [];

  for (let i = 0; i < 10; i++) {
    const src = stations[i % stations.length];
    const dst = stations[(i + 1) % stations.length];
    const linkType = linkTypes[Math.floor(Math.random() * linkTypes.length)];

    links.push({
      id: uuidv4(),
      name: `${src.name.replace('站', '')}-${dst.name.replace('站', '')} ${linkType === 'fiber' ? '主干' : linkType === 'wireless' ? '无线' : '铜缆'}链路`,
      src_station: src.id,
      dst_station: dst.id,
      link_type: linkType,
      status: 'normal',
      latency: Math.floor(Math.random() * 20) + 5,
      bandwidth: linkType === 'fiber' ? 10000 : linkType === 'wireless' ? 1000 : 100,
      packet_loss: Math.random() * 0.005,
      last_heartbeat: new Date().toISOString(),
    });
  }

  return links;
}

function generateMockSignals(stations) {
  const signals = [];
  const commProtocol = require('./protocols/communication');
  const accessProtocol = require('./protocols/access');
  const broadcastProtocol = require('./protocols/broadcast');

  const sampleCount = 20;

  for (let i = 0; i < sampleCount; i++) {
    const types = ['communication', 'access', 'broadcast'];
    const type = types[Math.floor(Math.random() * types.length)];

    let signalData;
    switch (type) {
      case 'communication':
        signalData = commProtocol.generateSignal();
        break;
      case 'access':
        signalData = accessProtocol.generateSignal();
        break;
      case 'broadcast':
        signalData = broadcastProtocol.generateSignal();
        break;
    }

    const src = stations[Math.floor(Math.random() * stations.length)];
    const dst = stations[Math.floor(Math.random() * stations.length)];

    signals.push({
      id: uuidv4(),
      type,
      protocol: signalData.protocol,
      src_station: src.id,
      dst_station: dst.id,
      src_device: type === 'communication' ? 'PABX-' + (1000 + i) : type === 'access' ? 'ACS-CTRL-' + (100 + i) : 'PAS-AMP-' + (100 + i),
      dst_device: type === 'communication' ? 'IPPHONE-' + (2000 + i) : type === 'access' ? 'ACS-DOOR-' + (200 + i) : 'PAS-ZONE-' + (200 + i),
      timestamp: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString(),
      raw_data: signalData.rawData,
      parsed_data: signalData.parsedData,
      severity: signalData.severity,
      direction: signalData.direction || 'bidirectional',
    });
  }

  return signals;
}

function initializeMockData() {
  console.log('[Server] 开始初始化模拟数据...');

  MOCK_STATIONS.forEach(station => {
    db.insertStation({
      ...station,
      last_heartbeat: new Date().toISOString(),
    });
  });
  console.log('[Server] 已初始化 ' + MOCK_STATIONS.length + ' 个车站节点');

  const links = generateMockLinks(MOCK_STATIONS);
  links.forEach(link => db.insertLink(link));
  console.log('[Server] 已初始化 ' + links.length + ' 条通信链路');

  const signals = generateMockSignals(MOCK_STATIONS);
  signals.forEach(signal => {
    try {
      db.insertSignaling(signal);
    } catch (err) {
      // 忽略初始化时的唯一约束冲突
    }
  });
  console.log('[Server] 已初始化 ' + signals.length + ' 条信令样本');

  db.insertAuditLog({
    id: uuidv4(),
    action: 'init',
    entity_type: 'system',
    entity_id: null,
    operator: 'system',
    detail: JSON.stringify({ stations: MOCK_STATIONS.length, links: links.length, signals: signals.length }),
    timestamp: new Date().toISOString(),
  });

  console.log('[Server] 模拟数据初始化完成');
}

function startSniffer() {
  const sniffer = new SignalSniffer();

  setSignalingSniffer(sniffer);

  sniffer.on('signal', (signal) => {
    broadcastToClients({
      type: 'signal',
      data: signal,
      timestamp: new Date().toISOString(),
    });
  });

  sniffer.on('signalRetry', (retryInfo) => {
    broadcastToClients({
      type: 'signalRetry',
      data: retryInfo,
      timestamp: new Date().toISOString(),
    });
  });

  sniffer.on('signalBatch', (batchInfo) => {
    broadcastToClients({
      type: 'signalBatch',
      data: batchInfo,
      timestamp: new Date().toISOString(),
    });
  });

  sniffer.on('trainHandoverStart', (handoverInfo) => {
    broadcastToClients({
      type: 'trainHandoverStart',
      data: handoverInfo,
      timestamp: new Date().toISOString(),
    });
  });

  sniffer.on('trainHandoverComplete', (handoverInfo) => {
    broadcastToClients({
      type: 'trainHandoverComplete',
      data: handoverInfo,
      timestamp: new Date().toISOString(),
    });
  });

  sniffer.on('linkStatusChange', (linkChange) => {
    broadcastToClients({
      type: 'linkStatusChange',
      data: linkChange,
      timestamp: new Date().toISOString(),
    });
  });

  sniffer.start();

  return sniffer;
}

async function main() {
  console.log('========================================');
  console.log('  地铁弱电系统信令接收服务');
  console.log('  Metro Signaling Service v1.0.0');
  console.log('========================================');

  await db.initDatabase();
  console.log('[DB] 数据库初始化完成');

  const stations = db.getAllStations();
  if (stations.length === 0) {
    initializeMockData();
  } else {
    console.log('[Server] 数据已存在，跳过模拟数据初始化');
    console.log('[Server] 当前数据: ' + stations.length + ' 车站, ' + db.getAllLinks().length + ' 链路');
  }

  const sniffer = startSniffer();

  server.listen(PORT, () => {
    console.log('========================================');
    console.log('  服务已启动');
    console.log('  HTTP 服务: http://localhost:' + PORT);
    console.log('  WebSocket: ws://localhost:' + PORT + '/ws');
    console.log('========================================');
    console.log('');
    console.log('可用 API 端点:');
    console.log('  GET  /api/health           - 健康检查');
    console.log('  GET  /api/stations         - 车站列表');
    console.log('  GET  /api/stations/:id     - 车站详情');
    console.log('  GET  /api/links            - 链路列表');
    console.log('  POST /api/links/:id/reset  - 重置链路');
    console.log('  GET  /api/signaling        - 信令列表');
    console.log('  GET  /api/signaling/stats  - 信令统计');
    console.log('  GET  /api/signaling/:id    - 信令详情');
    console.log('');
    console.log('[Server] 信令抓取服务已启动，开始模拟抓取...');
  });
}

main().catch(err => {
  console.error('[Server] 启动失败:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n[Server] 收到中断信号，正在关闭...');
  server.close(() => {
    console.log('[Server] 服务已关闭');
    process.exit(0);
  });
});