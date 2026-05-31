require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.GATEWAY_PORT || 3001;
const PERSISTENCE_URL = `http://localhost:${process.env.PERSISTENCE_PORT || 3003}`;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const nodeStatusCache = new Map();
const recentHeartbeats = [];
const MAX_RECENT_HEARTBEATS = 200;
const NODE_TIMEOUT_MS = 30000;
const NODE_EVICT_MS = 120000;
const CACHE_CLEANUP_INTERVAL_MS = 15000;
const PERSIST_BATCH_SIZE = 50;
const PERSIST_BATCH_INTERVAL_MS = 2000;

const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;

function rateLimiter(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const record = requestCounts.get(key);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(key, { windowStart: now, count: 1 });
    next();
    return;
  }

  record.count++;
  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ success: false, error: '请求过于频繁，请稍后再试' });
    return;
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      requestCounts.delete(key);
    }
  }
}, 30000);

const persistQueue = [];
let isPersisting = false;

async function flushPersistQueue() {
  if (isPersisting || persistQueue.length === 0) return;
  isPersisting = true;

  const batch = persistQueue.splice(0, PERSIST_BATCH_SIZE);

  try {
    await axios.post(`${PERSISTENCE_URL}/api/node/heartbeat/batch`, { heartbeats: batch });
  } catch (error) {
    console.error('批量持久化失败，单条重试:', error.message);
    for (const item of batch) {
      try {
        await axios.post(`${PERSISTENCE_URL}/api/node/heartbeat`, item);
      } catch (retryError) {
        console.error('单条持久化重试失败:', retryError.message);
      }
    }
  } finally {
    isPersisting = false;
    if (persistQueue.length > 0) {
      setTimeout(flushPersistQueue, 100);
    }
  }
}

setInterval(flushPersistQueue, PERSIST_BATCH_INTERVAL_MS);

function enqueuePersist(metrics) {
  persistQueue.push(metrics);
  if (persistQueue.length >= PERSIST_BATCH_SIZE) {
    flushPersistQueue();
  }
}

function updateNodeCache(metrics) {
  const cached = nodeStatusCache.get(metrics.nodeId);
  const now = Date.now();
  const incomingTime = new Date(metrics.timestamp || Date.now()).getTime();

  if (cached) {
    const cachedTime = new Date(cached.lastUpdate).getTime();
    if (incomingTime < cachedTime) {
      return cached;
    }
  }

  const entry = {
    ...metrics,
    lastUpdate: new Date(incomingTime),
    cacheTime: now
  };
  nodeStatusCache.set(metrics.nodeId, entry);
  return entry;
}

app.post('/api/collector/heartbeat', rateLimiter, (req, res) => {
  try {
    const metrics = req.body;

    if (!metrics || !metrics.nodeId) {
      return res.status(400).json({ success: false, error: '缺少nodeId字段' });
    }

    const cachedEntry = updateNodeCache(metrics);

    recentHeartbeats.push({ ...cachedEntry, receivedAt: new Date() });
    if (recentHeartbeats.length > MAX_RECENT_HEARTBEATS) {
      recentHeartbeats.splice(0, recentHeartbeats.length - MAX_RECENT_HEARTBEATS);
    }

    broadcastToClients({
      type: 'heartbeat',
      data: cachedEntry
    });

    enqueuePersist(metrics);

    res.json({ success: true, message: '心跳已接收' });
  } catch (error) {
    console.error('处理心跳错误:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/collector/heartbeat/batch', rateLimiter, (req, res) => {
  try {
    const { heartbeats } = req.body;

    if (!Array.isArray(heartbeats) || heartbeats.length === 0) {
      return res.status(400).json({ success: false, error: 'heartbeats必须为非空数组' });
    }

    const validHeartbeats = heartbeats.filter(h => h && h.nodeId);

    if (validHeartbeats.length === 0) {
      return res.status(400).json({ success: false, error: '无有效心跳数据' });
    }

    for (const metrics of validHeartbeats) {
      const cachedEntry = updateNodeCache(metrics);

      recentHeartbeats.push({ ...cachedEntry, receivedAt: new Date() });

      enqueuePersist(metrics);
    }

    if (recentHeartbeats.length > MAX_RECENT_HEARTBEATS) {
      recentHeartbeats.splice(0, recentHeartbeats.length - MAX_RECENT_HEARTBEATS);
    }

    broadcastToClients({
      type: 'batch_heartbeat',
      data: validHeartbeats.map(h => nodeStatusCache.get(h.nodeId) || h)
    });

    res.json({
      success: true,
      message: `批量心跳已接收: ${validHeartbeats.length}条`
    });
  } catch (error) {
    console.error('处理批量心跳错误:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/nodes', async (req, res) => {
  try {
    const { groupId, region, status, page = 1, pageSize = 10, source } = req.query;

    if (source === 'cache') {
      let nodes = Array.from(nodeStatusCache.values());

      if (groupId) nodes = nodes.filter(n => n.groupId === groupId);
      if (region) nodes = nodes.filter(n => n.region === region);
      if (status) nodes = nodes.filter(n => n.status === status);

      nodes.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));

      const total = nodes.length;
      const offset = (page - 1) * pageSize;
      const paged = nodes.slice(offset, offset + parseInt(pageSize));

      return res.json({
        success: true,
        data: paged.map(n => ({
          node_id: n.nodeId,
          group_id: n.groupId,
          region: n.region,
          last_status: n.status,
          last_update: n.lastUpdate,
          cpu: n.cpu,
          memory: n.memory,
          bandwidth: n.bandwidth,
          uptime: n.uptime
        })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    }

    const response = await axios.get(`${PERSISTENCE_URL}/api/nodes`, { params: req.query });
    res.json(response.data);
  } catch (error) {
    console.error('获取节点列表错误:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/node/:nodeId/metrics', async (req, res) => {
  try {
    const response = await axios.get(`${PERSISTENCE_URL}/api/node/${req.params.nodeId}/metrics`, { params: req.query });
    res.json(response.data);
  } catch (error) {
    console.error('获取节点指标错误:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/nodes/hot', async (req, res) => {
  try {
    const response = await axios.get(`${PERSISTENCE_URL}/api/nodes/hot`, { params: req.query });

    if (response.data.success && response.data.data) {
      const enriched = response.data.data.map(hotNode => {
        const cached = nodeStatusCache.get(hotNode.nodeId);
        if (cached) {
          return {
            ...hotNode,
            cpu: cached.cpu,
            memory: cached.memory,
            bandwidth: cached.bandwidth,
            status: cached.status,
            uptime: cached.uptime
          };
        }
        return hotNode;
      });
      response.data.data = enriched;
    }

    res.json(response.data);
  } catch (error) {
    console.error('获取热点节点错误:', error.message);
    const nodes = Array.from(nodeStatusCache.values());
    nodes.sort((a, b) => (b.heartbeatCount || 0) - (a.heartbeatCount || 0));
    res.json({ success: true, data: nodes.slice(0, 10) });
  }
});

app.get('/api/nodes/realtime', (req, res) => {
  const nodes = Array.from(nodeStatusCache.values());
  res.json({ success: true, data: nodes });
});

app.get('/api/groups', async (req, res) => {
  try {
    const response = await axios.get(`${PERSISTENCE_URL}/api/groups`);
    res.json(response.data);
  } catch (error) {
    console.error('获取分组错误:', error.message);
    const groups = new Map();
    nodeStatusCache.forEach(node => {
      const count = groups.get(node.groupId) || 0;
      groups.set(node.groupId, count + 1);
    });
    res.json({
      success: true,
      data: Array.from(groups.entries()).map(([id, node_count]) => ({ id, node_count }))
    });
  }
});

app.get('/api/regions', async (req, res) => {
  try {
    const response = await axios.get(`${PERSISTENCE_URL}/api/regions`);
    res.json(response.data);
  } catch (error) {
    console.error('获取区域错误:', error.message);
    const regions = new Map();
    nodeStatusCache.forEach(node => {
      const count = regions.get(node.region) || 0;
      regions.set(node.region, count + 1);
    });
    res.json({
      success: true,
      data: Array.from(regions.entries()).map(([name, node_count]) => ({ name, node_count }))
    });
  }
});

app.get('/api/statistics', (req, res) => {
  const nodes = Array.from(nodeStatusCache.values());
  const now = Date.now();
  const activeNodes = nodes.filter(n => now - new Date(n.lastUpdate).getTime() < NODE_TIMEOUT_MS);

  const online = activeNodes.filter(n => n.status === 'online').length;
  const offline = activeNodes.filter(n => n.status === 'offline').length;
  const warning = activeNodes.filter(n => n.status === 'warning').length;

  const avgCpu = activeNodes.length > 0
    ? (activeNodes.reduce((sum, n) => sum + (n.cpu || 0), 0) / activeNodes.length).toFixed(2)
    : 0;
  const avgMemory = activeNodes.length > 0
    ? (activeNodes.reduce((sum, n) => sum + (n.memory || 0), 0) / activeNodes.length).toFixed(2)
    : 0;

  res.json({
    success: true,
    data: {
      total: nodes.length,
      online,
      offline,
      warning,
      avgCpu: parseFloat(avgCpu),
      avgMemory: parseFloat(avgMemory),
      recentHeartbeats: recentHeartbeats.length,
      persistQueueSize: persistQueue.length
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'gateway',
    timestamp: new Date(),
    connectedClients: wss.clients.size,
    cachedNodes: nodeStatusCache.size,
    persistQueueSize: persistQueue.length,
    recentHeartbeats: recentHeartbeats.length
  });
});

function broadcastToClients(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('WebSocket客户端已连接');

  ws.send(JSON.stringify({
    type: 'welcome',
    message: '已连接到遥测网关',
    timestamp: new Date(),
    nodeCount: nodeStatusCache.size
  }));

  const snapshot = Array.from(nodeStatusCache.values());
  ws.send(JSON.stringify({
    type: 'snapshot',
    data: snapshot
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe') {
        console.log('客户端订阅:', data.topic);
      }
    } catch (e) {
      console.log('收到非JSON消息:', message.toString());
    }
  });

  ws.on('close', () => {
    console.log('WebSocket客户端已断开');
  });
});

setInterval(() => {
  const now = Date.now();

  nodeStatusCache.forEach((node, nodeId) => {
    const elapsed = now - new Date(node.lastUpdate).getTime();

    if (elapsed > NODE_TIMEOUT_MS && node.status !== 'offline') {
      node.status = 'offline';
      broadcastToClients({
        type: 'heartbeat',
        data: node
      });
    }

    if (elapsed > NODE_EVICT_MS) {
      nodeStatusCache.delete(nodeId);
    }
  });
}, CACHE_CLEANUP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`网关服务运行在端口 ${PORT}`);
  console.log(`WebSocket服务已启动`);
  console.log(`持久化服务地址: ${PERSISTENCE_URL}`);
  console.log(`批量持久化: 批量大小=${PERSIST_BATCH_SIZE}, 间隔=${PERSIST_BATCH_INTERVAL_MS}ms`);
  console.log(`缓存清理: 超时=${NODE_TIMEOUT_MS}ms, 淘汰=${NODE_EVICT_MS}ms, 间隔=${CACHE_CLEANUP_INTERVAL_MS}ms`);
});
