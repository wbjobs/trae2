/**
 * 车站同步服务 REST 路由
 *
 * 路由前缀: /api
 */

const express = require('express');
const { nodeManager, NodeType, NodeStatus } = require('../nodes');
const { syncEngine, SyncOperation, SyncPriority } = require('../sync');

const router = express.Router();

// ========== 节点管理路由 ==========

router.get('/nodes', (req, res) => {
  const { type } = req.query;
  let nodes;
  if (type) {
    const validTypes = Object.values(NodeType);
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: '无效的节点类型，有效值: ' + validTypes.join(', '),
      });
    }
    nodes = nodeManager.getAllNodes(type);
  } else {
    nodes = nodeManager.getAllNodes();
  }
  res.json({
    success: true,
    total: nodes.length,
    nodes,
    timestamp: Date.now(),
  });
});

router.get('/nodes/:id', (req, res) => {
  const { id } = req.params;
  const node = nodeManager.getNodeById(id);
  if (!node) {
    return res.status(404).json({
      success: false,
      error: '节点不存在',
      nodeId: id,
    });
  }
  res.json({
    success: true,
    node,
    timestamp: Date.now(),
  });
});

router.post('/nodes', (req, res) => {
  const { type, name, description, ip, port, metadata } = req.body;
  if (!type || !name) {
    return res.status(400).json({
      success: false,
      error: '节点类型和名称为必填项',
    });
  }
  const validTypes = Object.values(NodeType);
  if (!validTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      error: '无效的节点类型，有效值: ' + validTypes.join(', '),
    });
  }
  const node = nodeManager.register({ type, name, description, ip, port, metadata });
  res.status(201).json({
    success: true,
    node,
    message: '节点注册成功',
    timestamp: Date.now(),
  });
});

router.delete('/nodes/:id', (req, res) => {
  const { id } = req.params;
  const success = nodeManager.unregister(id);
  if (!success) {
    return res.status(404).json({
      success: false,
      error: '节点不存在',
      nodeId: id,
    });
  }
  res.json({
    success: true,
    message: '节点注销成功',
    nodeId: id,
    timestamp: Date.now(),
  });
});

router.post('/nodes/:id/heartbeat', (req, res) => {
  const { id } = req.params;
  const success = nodeManager.heartbeat(id);
  if (!success) {
    return res.status(404).json({
      success: false,
      error: '节点不存在',
      nodeId: id,
    });
  }
  res.json({
    success: true,
    message: '心跳已确认',
    nodeId: id,
    timestamp: Date.now(),
  });
});

// ========== 数据同步路由 ==========

router.post('/sync/push', async (req, res) => {
  const { sourceNodeId, dataKey, dataValue, operation, priority, metadata } = req.body;
  if (!sourceNodeId || !dataKey) {
    return res.status(400).json({
      success: false,
      error: '源节点 ID 和数据键为必填项',
    });
  }
  const validOps = Object.values(SyncOperation);
  const op = operation && validOps.includes(operation) ? operation : SyncOperation.UPDATE;
  const pr = priority && Object.values(SyncPriority).includes(priority) ? priority : SyncPriority.NORMAL;

  try {
    const result = await syncEngine.pushData(sourceNodeId, {
      dataKey,
      dataValue,
      operation: op,
      priority: pr,
      metadata,
    });
    res.status(result.success ? 200 : 409).json({
      ...result,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      timestamp: Date.now(),
    });
  }
});

router.post('/sync/batch-push', async (req, res) => {
  const { sourceNodeId, items } = req.body;
  if (!sourceNodeId || !Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      error: '源节点 ID 和数据项数组为必填项',
    });
  }
  try {
    const result = await syncEngine.batchPush(sourceNodeId, items);
    res.json({
      ...result,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      timestamp: Date.now(),
    });
  }
});

router.post('/sync/pull', async (req, res) => {
  const { targetNodeId, sinceIndex, dataKey, deltaOnly } = req.body;
  if (!targetNodeId) {
    return res.status(400).json({
      success: false,
      error: '目标节点 ID 为必填项',
    });
  }
  try {
    const result = await syncEngine.pullData(targetNodeId, { sinceIndex, dataKey, deltaOnly });
    res.status(result.success ? 200 : 404).json({
      ...result,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      timestamp: Date.now(),
    });
  }
});

router.post('/sync/pull-snapshot', async (req, res) => {
  const { targetNodeId } = req.body;
  if (!targetNodeId) {
    return res.status(400).json({
      success: false,
      error: '目标节点 ID 为必填项',
    });
  }
  try {
    const result = await syncEngine.pullSnapshot(targetNodeId);
    res.status(result.success ? 200 : 404).json({
      ...result,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      timestamp: Date.now(),
    });
  }
});

router.post('/sync/incremental', async (req, res) => {
  const { targetNodeId } = req.body;
  if (!targetNodeId) {
    return res.status(400).json({
      success: false,
      error: '目标节点 ID 为必填项',
    });
  }
  try {
    const result = await syncEngine.incrementalSync(targetNodeId);
    res.status(result.success ? 200 : 404).json({
      ...result,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      timestamp: Date.now(),
    });
  }
});

router.post('/sync/broadcast', async (req, res) => {
  const { sourceNodeId, dataKey, dataValue, operation, priority, metadata } = req.body;
  if (!sourceNodeId || !dataKey) {
    return res.status(400).json({
      success: false,
      error: '源节点 ID 和数据键为必填项',
    });
  }
  const validOps = Object.values(SyncOperation);
  const op = operation && validOps.includes(operation) ? operation : SyncOperation.UPDATE;
  const pr = priority && Object.values(SyncPriority).includes(priority) ? priority : SyncPriority.NORMAL;

  try {
    const result = await syncEngine.syncToDownstream(sourceNodeId, {
      dataKey,
      dataValue,
      operation: op,
      priority: pr,
      metadata,
    });
    res.status(result.success ? 200 : 400).json({
      ...result,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      timestamp: Date.now(),
    });
  }
});

router.get('/sync/status', (req, res) => {
  const status = syncEngine.getSyncStatus();
  res.json({
    success: true,
    status,
    timestamp: Date.now(),
  });
});

router.get('/sync/snapshots', (req, res) => {
  const snapshots = syncEngine.getSnapshots();
  res.json({
    success: true,
    snapshots,
    timestamp: Date.now(),
  });
});

router.get('/sync/changes', (req, res) => {
  const { limit, offset, dataKey, sourceNodeId } = req.query;
  let changes = syncEngine.changeLog;

  if (dataKey) {
    changes = changes.filter(e => e.dataKey === dataKey);
  }
  if (sourceNodeId) {
    changes = changes.filter(e => e.sourceNodeId === sourceNodeId);
  }

  const parsedLimit = parseInt(limit, 10) || 100;
  const parsedOffset = parseInt(offset, 10) || 0;
  const total = changes.length;
  changes = changes.slice(parsedOffset, parsedOffset + parsedLimit);

  res.json({
    success: true,
    total,
    returned: changes.length,
    offset: parsedOffset,
    limit: parsedLimit,
    changes,
    timestamp: Date.now(),
  });
});

// ========== 快速路径/直接推送管理路由 ==========

router.post('/sync/quick-path', (req, res) => {
  const { dataKey, action } = req.body;
  if (!dataKey || !action) {
    return res.status(400).json({
      success: false,
      error: '数据键和操作类型为必填项',
    });
  }
  if (action === 'register') {
    syncEngine.registerQuickPath(dataKey);
    res.json({ success: true, message: '快速路径已注册', dataKey });
  } else if (action === 'unregister') {
    syncEngine.unregisterQuickPath(dataKey);
    res.json({ success: true, message: '快速路径已注销', dataKey });
  } else {
    res.status(400).json({
      success: false,
      error: '无效的操作，有效值: register, unregister',
    });
  }
});

router.get('/health', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      service: 'metro-station-sync',
      version: '2.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
