require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { createClient } = require('redis');
const MessageParser = require('./lib/message-parser');
const ExportManager = require('./lib/export-manager');
const ClusterManager = require('./lib/cluster-manager');
const BatchWriter = require('./lib/batch-writer');

const app = express();
const PORT = process.env.PERSISTENCE_PORT || 3003;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

let mysqlPool;
let redisClient;
let messageParser;
let exportManager;
let clusterManager;
let batchWriter;

const METRICS_RETENTION_DAYS = 30;
const HOT_NODES_MAX_SCORE = 10000;
const HOT_NODES_TRIM_SIZE = 100;
const REDIS_KEY_PREFIX = 'node:';
const REDIS_KEY_TTL_SECONDS = 120;
const NODE_ID = process.env.PERSISTENCE_NODE_ID || 'persistence-primary';

async function initMySQL() {
  mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 1000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4'
  });
  console.log('MySQL连接池已创建, 最大连接数: 50');
}

async function initRedis() {
  redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 500)
    }
  });
  redisClient.on('error', (err) => console.log('Redis Client Error', err));
  await redisClient.connect();
  console.log('Redis连接已建立');
}

async function initModules() {
  messageParser = new MessageParser(redisClient, mysqlPool);
  await messageParser.loadFormats();

  exportManager = new ExportManager(mysqlPool, redisClient, 'exports');

  clusterManager = new ClusterManager(mysqlPool, redisClient, NODE_ID);
  await clusterManager.init();

  batchWriter = new BatchWriter(mysqlPool, redisClient, {
    maxBatchSize: 500,
    maxBatchInterval: 500,
    useLoadData: true,
    useTransaction: true
  });

  messageParser.on('format:updated', ({ formatName, updates }) => {
    console.log(`报文格式已更新: ${formatName}`, updates);
  });

  clusterManager.on('failover:complete', ({ failedNode, newActiveNode, nodeType }) => {
    console.log(`故障转移: ${failedNode} -> ${newActiveNode} (${nodeType})`);
  });

  console.log('所有功能模块已初始化');
}

async function persistSingleHeartbeat({ nodeId, groupId, region, cpu, memory, bandwidth, uptime, status }) {
  const timestamp = new Date();

  const cacheKey = `${REDIS_KEY_PREFIX}${nodeId}:status`;
  await redisClient.setEx(cacheKey, REDIS_KEY_TTL_SECONDS, JSON.stringify({
    nodeId, groupId, region, cpu, memory, bandwidth, uptime, status, lastUpdate: timestamp
  }));

  const hotKey = 'hot:nodes';
  await redisClient.zIncrBy(hotKey, 1, nodeId);

  await mysqlPool.execute(
    `INSERT INTO node_metrics (node_id, group_id, region, cpu_usage, memory_usage, bandwidth_usage, uptime, status, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nodeId, groupId, region, cpu, memory, bandwidth, uptime, status, timestamp]
  );

  await mysqlPool.execute(
    `INSERT INTO nodes (node_id, group_id, region, last_status, last_update)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_status = ?, last_update = ?`,
    [nodeId, groupId, region, status, timestamp, status, timestamp]
  );
}

app.post('/api/node/heartbeat', async (req, res) => {
  try {
    const { nodeId, groupId, region, cpu, memory, bandwidth, uptime, status } = req.body;

    if (!nodeId) {
      return res.status(400).json({ success: false, error: '缺少nodeId字段' });
    }

    await persistSingleHeartbeat({ nodeId, groupId, region, cpu, memory, bandwidth, uptime, status });
    res.json({ success: true, message: '数据已持久化' });
  } catch (error) {
    console.error('持久化错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/node/heartbeat/batch', async (req, res) => {
  try {
    const { heartbeats } = req.body;

    if (!Array.isArray(heartbeats) || heartbeats.length === 0) {
      return res.status(400).json({ success: false, error: 'heartbeats必须为非空数组' });
    }

    const validHeartbeats = heartbeats.filter(h => h && h.nodeId);

    if (validHeartbeats.length === 0) {
      return res.status(400).json({ success: false, error: '无有效心跳数据' });
    }

    const startTime = Date.now();

    if (batchWriter && validHeartbeats.length >= 10) {
      await batchWriter.queueHeartbeats(validHeartbeats);
      await batchWriter.flush();

      const duration = Date.now() - startTime;
      return res.json({
        success: true,
        message: `批量持久化完成: ${validHeartbeats.length}条, 耗时${duration}ms`,
        data: {
          processed: validHeartbeats.length,
          duration,
          method: 'batch_writer',
          bufferStatus: batchWriter.getBufferStatus()
        }
      });
    }

    const results = { success: 0, failed: 0, errors: [] };
    const timestamp = new Date();

    const redisPipeline = redisClient.multi();
    for (const h of validHeartbeats) {
      const cacheKey = `${REDIS_KEY_PREFIX}${h.nodeId}:status`;
      redisPipeline.setEx(cacheKey, REDIS_KEY_TTL_SECONDS, JSON.stringify({
        nodeId: h.nodeId, groupId: h.groupId, region: h.region,
        cpu: h.cpu, memory: h.memory, bandwidth: h.bandwidth,
        uptime: h.uptime, status: h.status, lastUpdate: timestamp
      }));
      redisPipeline.zIncrBy('hot:nodes', 1, h.nodeId);
    }
    await redisPipeline.exec();

    const metricsValues = validHeartbeats.map(h => [
      h.nodeId, h.groupId, h.region, h.cpu, h.memory, h.bandwidth, h.uptime, h.status, timestamp
    ]);

    const [metricsResult] = await mysqlPool.query(
      `INSERT INTO node_metrics (node_id, group_id, region, cpu_usage, memory_usage, bandwidth_usage, uptime, status, timestamp)
       VALUES ?`,
      [metricsValues]
    );
    results.success += validHeartbeats.length;

    const nodesUpsertValues = validHeartbeats.map(h => [h.nodeId, h.groupId, h.region, h.status, timestamp]);
    for (const [nodeId, groupId, region, status, ts] of nodesUpsertValues) {
      await mysqlPool.execute(
        `INSERT INTO nodes (node_id, group_id, region, last_status, last_update)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE last_status = ?, last_update = ?`,
        [nodeId, groupId, region, status, ts, status, ts]
      );
    }

    const duration = Date.now() - startTime;
    res.json({
      success: true,
      message: `批量持久化完成: 成功${results.success}条, 失败${results.failed}条, 耗时${duration}ms`,
      data: results
    });
  } catch (error) {
    console.error('批量持久化错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/node/heartbeat/parse', async (req, res) => {
  try {
    const { message, format = 'default_heartbeat', batch = false } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: '缺少message字段' });
    }

    let parsed;
    if (batch) {
      parsed = messageParser.parseBatch(Array.isArray(message) ? message : [message], format);
    } else {
      parsed = { success: [messageParser.parse(message, format)], failed: [], errors: [] };
    }

    if (parsed.success.length > 0) {
      await batchWriter.queueHeartbeats(parsed.success);
      await batchWriter.flush();
    }

    res.json({
      success: true,
      data: {
        success: parsed.success.length,
        failed: parsed.failed.length,
        errors: parsed.errors,
        results: parsed
      }
    });
  } catch (error) {
    console.error('解析失败:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/nodes', async (req, res) => {
  try {
    const { groupId, region, status, page = 1, pageSize = 10 } = req.query;
    let whereClause = 'WHERE 1=1';
    let params = [];

    if (groupId) {
      whereClause += ' AND group_id = ?';
      params.push(groupId);
    }
    if (region) {
      whereClause += ' AND region = ?';
      params.push(region);
    }
    if (status) {
      whereClause += ' AND last_status = ?';
      params.push(status);
    }

    const offset = (page - 1) * pageSize;
    params.push(parseInt(pageSize), offset);

    const [rows] = await mysqlPool.execute(
      `SELECT * FROM nodes ${whereClause} ORDER BY last_update DESC LIMIT ? OFFSET ?`,
      params
    );

    const [countResult] = await mysqlPool.execute(
      `SELECT COUNT(*) as total FROM nodes ${whereClause}`,
      params.slice(0, params.length - 2)
    );

    res.json({
      success: true,
      data: rows,
      total: countResult[0].total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('查询节点错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/node/:nodeId/metrics', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { limit = 100 } = req.query;

    const [rows] = await mysqlPool.execute(
      `SELECT * FROM node_metrics WHERE node_id = ? ORDER BY timestamp DESC LIMIT ?`,
      [nodeId, parseInt(limit)]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('查询指标错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/nodes/hot', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const hotNodes = await redisClient.zRangeWithScores('hot:nodes', 0, limit - 1, { REV: true });

    const nodesWithStatus = [];
    for (const node of hotNodes) {
      const statusData = await redisClient.get(`${REDIS_KEY_PREFIX}${node.value}:status`);
      if (statusData) {
        nodesWithStatus.push({ ...JSON.parse(statusData), hotScore: node.score });
      }
    }

    res.json({ success: true, data: nodesWithStatus });
  } catch (error) {
    console.error('查询热点节点错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/groups', async (req, res) => {
  try {
    const [rows] = await mysqlPool.execute(
      `SELECT DISTINCT group_id as id, COUNT(*) as node_count 
       FROM nodes GROUP BY group_id`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('查询分组错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/regions', async (req, res) => {
  try {
    const [rows] = await mysqlPool.execute(
      `SELECT DISTINCT region as name, COUNT(*) as node_count 
       FROM nodes GROUP BY region`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('查询区域错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/formats', (req, res) => {
  try {
    const { onlyActive } = req.query;
    const formats = messageParser.listFormats(onlyActive === 'true');
    res.json({ success: true, data: formats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/formats/:formatName', (req, res) => {
  try {
    const format = messageParser.getFormat(req.params.formatName);
    if (!format) {
      return res.status(404).json({ success: false, error: '格式未找到' });
    }
    res.json({ success: true, data: format });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/formats', async (req, res) => {
  try {
    const result = await messageParser.createFormat(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/formats/:formatName', async (req, res) => {
  try {
    await messageParser.updateFormat(req.params.formatName, req.body);
    res.json({ success: true, message: '格式已更新' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/formats/:formatName', async (req, res) => {
  try {
    await messageParser.deleteFormat(req.params.formatName);
    res.json({ success: true, message: '格式已删除' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/export', async (req, res) => {
  try {
    const result = await exportManager.createTask(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/export/:taskId', async (req, res) => {
  try {
    const task = await exportManager.getTaskStatus(req.params.taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/export/:taskId/download', async (req, res) => {
  try {
    const task = await exportManager.getTaskStatus(req.params.taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }
    if (task.status !== 'completed') {
      return res.status(400).json({ success: false, error: '任务尚未完成' });
    }

    const filePath = exportManager.getDownloadPath(req.params.taskId);
    if (!filePath) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    res.download(filePath, `${req.params.taskId}.${task.format}`);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/exports', async (req, res) => {
  try {
    const { status, limit } = req.query;
    const tasks = await exportManager.listTasks(status, limit || 100);
    res.json({
      success: true,
      data: tasks,
      queueStats: exportManager.getQueueStats()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/export/:taskId', async (req, res) => {
  try {
    await exportManager.deleteTask(req.params.taskId);
    res.json({ success: true, message: '任务已删除' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/cluster/state', async (req, res) => {
  try {
    const state = await clusterManager.getClusterState();
    res.json({ success: true, data: state });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/cluster/nodes', (req, res) => {
  try {
    const { nodeType } = req.query;
    let nodes = clusterManager.getAllNodes();
    if (nodeType) {
      nodes = nodes.filter(n => n.nodeType === nodeType);
    }
    res.json({ success: true, data: nodes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/cluster/nodes', async (req, res) => {
  try {
    const node = await clusterManager.addNode(req.body);
    res.json({ success: true, data: node });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/cluster/nodes/:nodeId/status', async (req, res) => {
  try {
    const { status } = req.body;
    await clusterManager.setNodeStatus(req.params.nodeId, status);
    res.json({ success: true, message: '节点状态已更新' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/cluster/nodes/:nodeId', async (req, res) => {
  try {
    await clusterManager.removeNode(req.params.nodeId);
    res.json({ success: true, message: '节点已删除' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/cluster/leader', (req, res) => {
  res.json({
    success: true,
    data: {
      isLeader: clusterManager.isLeader,
      currentNode: NODE_ID
    }
  });
});

app.post('/api/cluster/failover/:nodeId', async (req, res) => {
  try {
    const node = clusterManager.nodes.get(req.params.nodeId);
    if (!node) {
      return res.status(404).json({ success: false, error: '节点不存在' });
    }
    await clusterManager.handleNodeFailure(node);
    res.json({ success: true, message: '手动故障转移已执行' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/performance/write-stats', async (req, res) => {
  try {
    const { hours = 1, historical = 'false' } = req.query;
    let data;

    if (historical === 'true') {
      data = await batchWriter.getHistoricalPerformanceStats(parseInt(hours));
    } else {
      data = batchWriter.getPerformanceStats(parseInt(hours));
    }

    res.json({
      success: true,
      data,
      bufferStatus: batchWriter.getBufferStatus()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/performance/flush', async (req, res) => {
  try {
    const status = await batchWriter.forceFlush();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function cleanupExpiredRedisData() {
  try {
    const hotKey = 'hot:nodes';
    const allMembers = await redisClient.zRangeWithScores(hotKey, 0, -1);

    let trimmed = 0;
    for (const member of allMembers) {
      if (member.score > HOT_NODES_MAX_SCORE) {
        await redisClient.zAdd(hotKey, [{ score: HOT_NODES_MAX_SCORE, value: member.value }]);
        trimmed++;
      }
    }

    if (allMembers.length > HOT_NODES_TRIM_SIZE) {
      const removeCount = allMembers.length - HOT_NODES_TRIM_SIZE;
      const lowScoreMembers = allMembers.slice(0, removeCount).map(m => m.value);
      if (lowScoreMembers.length > 0) {
        await redisClient.zRem(hotKey, lowScoreMembers);
        trimmed += lowScoreMembers.length;
      }
    }

    let expiredKeys = 0;
    for (const member of allMembers) {
      const cacheKey = `${REDIS_KEY_PREFIX}${member.value}:status`;
      const exists = await redisClient.exists(cacheKey);
      if (!exists) {
        await redisClient.zRem(hotKey, member.value);
        expiredKeys++;
      }
    }

    if (trimmed > 0 || expiredKeys > 0) {
      console.log(`Redis清理: 修整${trimmed}条, 清除${expiredKeys}个过期热点键`);
    }
  } catch (error) {
    console.error('Redis清理错误:', error);
  }
}

async function cleanupOldMetrics() {
  try {
    const [result] = await mysqlPool.execute(
      `DELETE FROM node_metrics WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [METRICS_RETENTION_DAYS]
    );

    if (result.affectedRows > 0) {
      console.log(`MySQL清理: 删除${result.affectedRows}条超过${METRICS_RETENTION_DAYS}天的指标记录`);
    }
  } catch (error) {
    console.error('MySQL指标清理错误:', error);
  }
}

async function cleanupStaleNodes() {
  try {
    const [result] = await mysqlPool.execute(
      `UPDATE nodes SET last_status = 'offline' 
       WHERE last_update < DATE_SUB(NOW(), INTERVAL 5 MINUTE) AND last_status != 'offline'`
    );

    if (result.affectedRows > 0) {
      console.log(`MySQL清理: 将${result.affectedRows}个超时节点标记为offline`);
    }
  } catch (error) {
    console.error('MySQL节点状态清理错误:', error);
  }
}

setInterval(cleanupExpiredRedisData, 60000);
setInterval(cleanupOldMetrics, 3600000);
setInterval(cleanupStaleNodes, 120000);

app.get('/api/cleanup/run', async (req, res) => {
  try {
    await cleanupExpiredRedisData();
    await cleanupOldMetrics();
    await cleanupStaleNodes();
    res.json({ success: true, message: '清理任务已执行' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'persistence',
    nodeId: NODE_ID,
    timestamp: new Date(),
    isLeader: clusterManager ? clusterManager.isLeader : false,
    bufferStatus: batchWriter ? batchWriter.getBufferStatus() : null
  });
});

async function startServer() {
  await initMySQL();
  await initRedis();
  await initModules();

  await cleanupExpiredRedisData();
  await cleanupOldMetrics();
  await cleanupStaleNodes();

  app.listen(PORT, () => {
    console.log(`数据持久化服务运行在端口 ${PORT}`);
    console.log(`当前节点ID: ${NODE_ID}`);
    console.log(`指标数据保留${METRICS_RETENTION_DAYS}天`);
    console.log(`热点节点ZSet上限${HOT_NODES_TRIM_SIZE}条, 单项最大分数${HOT_NODES_MAX_SCORE}`);
    console.log(`\n=== 可用API接口 ===`);
    console.log('报文格式: GET/POST/PUT/DELETE /api/formats...');
    console.log('数据导出: POST/GET /api/export..., GET /api/exports');
    console.log('集群管理: GET /api/cluster/..., POST /api/cluster/failover/:nodeId');
    console.log('性能监控: GET /api/performance/write-stats');
    console.log('数据解析: POST /api/node/heartbeat/parse');
  });
}

process.on('SIGINT', async () => {
  console.log('正在关闭服务...');
  if (batchWriter) {
    await batchWriter.destroy();
  }
  if (clusterManager) {
    clusterManager.destroy();
  }
  if (mysqlPool) {
    await mysqlPool.end();
  }
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

startServer();
