require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.COLLECTOR_PORT || 3002;
const GATEWAY_URL = `http://localhost:${process.env.GATEWAY_PORT || 3001}`;

app.use(cors());
app.use(express.json());

const edgeNodes = [
  { nodeId: 'node-east-001', groupId: 'group-east', region: 'shanghai', baseUptime: Date.now() },
  { nodeId: 'node-east-002', groupId: 'group-east', region: 'shanghai', baseUptime: Date.now() },
  { nodeId: 'node-east-003', groupId: 'group-east', region: 'hangzhou', baseUptime: Date.now() },
  { nodeId: 'node-west-001', groupId: 'group-west', region: 'chengdu', baseUptime: Date.now() },
  { nodeId: 'node-west-002', groupId: 'group-west', region: 'chengdu', baseUptime: Date.now() },
  { nodeId: 'node-south-001', groupId: 'group-south', region: 'guangzhou', baseUptime: Date.now() },
  { nodeId: 'node-south-002', groupId: 'group-south', region: 'shenzhen', baseUptime: Date.now() },
  { nodeId: 'node-north-001', groupId: 'group-north', region: 'beijing', baseUptime: Date.now() },
  { nodeId: 'node-north-002', groupId: 'group-north', region: 'tianjin', baseUptime: Date.now() },
  { nodeId: 'node-east-004', groupId: 'group-east', region: 'nanjing', baseUptime: Date.now() },
  { nodeId: 'node-west-003', groupId: 'group-west', region: 'xian', baseUptime: Date.now() },
  { nodeId: 'node-south-003', groupId: 'group-south', region: 'shenzhen', baseUptime: Date.now() },
];

const MAX_CONCURRENT_REPORTS = 4;
const REPORT_RETRY_MAX = 2;
const REPORT_RETRY_DELAY_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 5000;

const httpClient = axios.create({
  baseURL: GATEWAY_URL,
  timeout: 5000,
  maxSockets: 10
});

function generateNodeMetrics(node) {
  const cpu = Math.random() * 100;
  const memory = 30 + Math.random() * 50;
  const bandwidth = 10 + Math.random() * 100;
  const uptime = Math.floor((Date.now() - node.baseUptime) / 1000);

  let status = 'online';
  if (cpu > 90 || memory > 90) {
    status = 'warning';
  }
  if (Math.random() < 0.02) {
    status = 'offline';
  }

  return {
    nodeId: node.nodeId,
    groupId: node.groupId,
    region: node.region,
    cpu: parseFloat(cpu.toFixed(2)),
    memory: parseFloat(memory.toFixed(2)),
    bandwidth: parseFloat(bandwidth.toFixed(2)),
    uptime,
    status,
    timestamp: new Date().toISOString()
  };
}

async function reportHeartbeatWithRetry(metrics, retryCount = 0) {
  try {
    await httpClient.post('/api/collector/heartbeat', metrics);
    console.log(`[${metrics.nodeId}] 心跳上报成功 - CPU: ${metrics.cpu}%, 状态: ${metrics.status}`);
  } catch (error) {
    if (retryCount < REPORT_RETRY_MAX) {
      console.warn(`[${metrics.nodeId}] 心跳上报失败, 第${retryCount + 1}次重试:`, error.message);
      await new Promise(resolve => setTimeout(resolve, REPORT_RETRY_DELAY_MS * (retryCount + 1)));
      return reportHeartbeatWithRetry(metrics, retryCount + 1);
    }
    console.error(`[${metrics.nodeId}] 心跳上报最终失败 (${retryCount + 1}次重试后):`, error.message);
  }
}

async function reportBatchHeartbeat(metricsList) {
  try {
    await httpClient.post('/api/collector/heartbeat/batch', { heartbeats: metricsList });
    console.log(`批量心跳上报成功: ${metricsList.length}个节点`);
  } catch (error) {
    console.error('批量心跳上报失败，降级为逐条上报:', error.message);
    for (const metrics of metricsList) {
      await reportHeartbeatWithRetry(metrics);
    }
  }
}

async function reportWithConcurrency(metricsList) {
  const batches = [];
  for (let i = 0; i < metricsList.length; i += MAX_CONCURRENT_REPORTS) {
    batches.push(metricsList.slice(i, i + MAX_CONCURRENT_REPORTS));
  }

  for (const batch of batches) {
    await Promise.allSettled(batch.map(m => reportHeartbeatWithRetry(m)));
  }
}

function startHeartbeatCollection() {
  console.log('启动心跳采集服务...');
  console.log(`上报网关地址: ${GATEWAY_URL}`);
  console.log(`最大并发上报: ${MAX_CONCURRENT_REPORTS}`);
  console.log(`心跳间隔: ${HEARTBEAT_INTERVAL_MS}ms`);

  setInterval(async () => {
    const allMetrics = edgeNodes.map(node => generateNodeMetrics(node));

    try {
      await reportBatchHeartbeat(allMetrics);
    } catch (error) {
      console.error('批量上报失败，降级为并发上报:', error.message);
      await reportWithConcurrency(allMetrics);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

app.post('/api/node/register', (req, res) => {
  const { nodeId, groupId, region } = req.body;
  const existingNode = edgeNodes.find(n => n.nodeId === nodeId);

  if (existingNode) {
    return res.json({ success: true, message: '节点已存在', node: existingNode });
  }

  const newNode = { nodeId, groupId, region, baseUptime: Date.now() };
  edgeNodes.push(newNode);
  res.json({ success: true, message: '节点注册成功', node: newNode });
});

app.get('/api/nodes', (req, res) => {
  const nodes = edgeNodes.map(node => ({
    nodeId: node.nodeId,
    groupId: node.groupId,
    region: node.region,
    uptime: Math.floor((Date.now() - node.baseUptime) / 1000)
  }));
  res.json({ success: true, data: nodes });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'collector', timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(`节点采集服务运行在端口 ${PORT}`);
  startHeartbeatCollection();
});
