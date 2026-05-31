/**
 * 同步引擎（增强版）
 *
 * 优化点：
 * 1. 增量快照机制 - 节点状态快照按变更点生成，减少传输量
 * 2. 批量同步处理 - 支持批量 push/pull，减少往返次数
 * 3. Delta 压缩 - 只传输变更字段，而非全量数据
 * 4. 主动推送模式 - 除了 pull 模式，增加主动推送到下游节点
 * 5. 快速路径 - 高优先级数据跳过排队直接同步
 */

const { v4: uuidv4 } = require('uuid');
const { NodeType, NodeStatus, nodeManager } = require('./nodes');

const ConflictResolution = {
  LAST_WRITE_WIN: 'last_write_win',
  SOURCE_PRIORITY: 'source_priority',
  MERGE: 'merge',
};

const SyncOperation = {
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
};

const SyncPriority = {
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
};

const BATCH_CONFIG = {
  MAX_BATCH_SIZE: 100,
  FLUSH_INTERVAL: 1000,
  PRIORITY_BATCH_SIZE: 200,
};

const SNAPSHOT_CONFIG = {
  MAX_SNAPSHOTS: 50,
  SNAPSHOT_INTERVAL: 5000,
};

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function computeDelta(oldValue, newValue) {
  if (typeof oldValue !== 'object' || typeof newValue !== 'object' || oldValue === null || newValue === null) {
    return { _full: newValue };
  }
  const delta = {};
  const allKeys = new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})]);
  for (const key of allKeys) {
    if (!deepEqual(oldValue[key], newValue[key])) {
      if (typeof newValue[key] === 'object' && newValue[key] !== null && typeof oldValue[key] === 'object' && oldValue[key] !== null) {
        delta[key] = computeDelta(oldValue[key], newValue[key]);
      } else {
        delta[key] = newValue[key];
      }
    }
  }
  return delta;
}

function applyDelta(baseValue, delta) {
  if (delta && delta._full !== undefined) {
    return delta._full;
  }
  if (typeof baseValue !== 'object' || baseValue === null) {
    return delta || baseValue;
  }
  const result = { ...baseValue };
  for (const key of Object.keys(delta || {})) {
    if (typeof delta[key] === 'object' && delta[key] !== null && !Array.isArray(delta[key])) {
      result[key] = applyDelta(baseValue[key], delta[key]);
    } else {
      result[key] = delta[key];
    }
  }
  return result;
}

class SyncEngine {
  constructor() {
    this.changeLog = [];
    this.maxChangeLogSize = 10000;
    this.syncCheckpoints = new Map();
    this.dataStore = new Map();
    this.activeSyncTasks = new Map();
    this.conflictResolution = ConflictResolution.SOURCE_PRIORITY;
    this.sourcePriority = {
      [NodeType.OCC_CENTER]: 3,
      [NodeType.STATION_NODE]: 2,
      [NodeType.ONBOARD_TERMINAL]: 1,
    };

    this.pendingBatch = [];
    this.batchFlushTimer = null;

    this.snapshots = new Map();
    this.snapshotTimer = null;
    this.lastSnapshotIndex = -1;

    this.directPushCallbacks = new Map();
    this.quickPathKeys = new Set();
  }

  start() {
    this.batchFlushTimer = setInterval(() => {
      this._flushBatch();
    }, BATCH_CONFIG.FLUSH_INTERVAL);

    this.snapshotTimer = setInterval(() => {
      this._createSnapshot();
    }, SNAPSHOT_CONFIG.SNAPSHOT_INTERVAL);

    console.log('[SyncEngine] 增强版同步引擎已启动');
  }

  stop() {
    if (this.batchFlushTimer) clearInterval(this.batchFlushTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    this.batchFlushTimer = null;
    this.snapshotTimer = null;
  }

  registerQuickPath(dataKey) {
    this.quickPathKeys.add(dataKey);
    console.log('[SyncEngine] 快速路径已注册: ' + dataKey);
  }

  unregisterQuickPath(dataKey) {
    this.quickPathKeys.delete(dataKey);
  }

  registerDirectPush(nodeId, callback) {
    this.directPushCallbacks.set(nodeId, callback);
  }

  unregisterDirectPush(nodeId) {
    this.directPushCallbacks.delete(nodeId);
  }

  async pushData(sourceNodeId, payload) {
    const sourceNode = nodeManager.getNodeById(sourceNodeId);
    if (!sourceNode) {
      return {
        success: false,
        error: '源节点不存在',
        syncId: null,
      };
    }

    const syncId = uuidv4();
    const timestamp = payload.timestamp || Date.now();
    const priority = payload.priority || SyncPriority.NORMAL;

    const existing = this.dataStore.get(payload.dataKey);
    const delta = existing ? computeDelta(existing.value, payload.dataValue) : { _full: payload.dataValue };

    const conflict = this._detectConflict(payload.dataKey, payload.dataValue, sourceNode);

    if (conflict.hasConflict) {
      const resolved = this._resolveConflict(conflict, sourceNode);
      if (resolved.ignored) {
        return {
          success: false,
          error: '数据冲突已按策略忽略',
          conflictDetail: resolved,
          syncId,
        };
      }
      payload.dataValue = resolved.resolvedValue;
    }

    const logEntry = {
      id: uuidv4(),
      syncId,
      dataKey: payload.dataKey,
      dataValue: payload.dataValue,
      delta,
      operation: payload.operation || SyncOperation.UPDATE,
      sourceNodeId,
      sourceNodeType: sourceNode.type,
      sourceNodeName: sourceNode.name,
      timestamp,
      priority,
      metadata: payload.metadata || {},
      conflictResolved: conflict.hasConflict,
    };

    this.changeLog.push(logEntry);
    this._trimChangeLog();

    this.dataStore.set(payload.dataKey, {
      value: payload.dataValue,
      operation: payload.operation || SyncOperation.UPDATE,
      sourceNodeId,
      sourceNodeType: sourceNode.type,
      lastUpdated: timestamp,
      version: (this.dataStore.get(payload.dataKey)?.version || 0) + 1,
    });

    if (this.quickPathKeys.has(payload.dataKey) || priority === SyncPriority.HIGH) {
      this._pushToDownstreamImmediate(sourceNode, payload, syncId);
    } else {
      this.pendingBatch.push({
        sourceNodeId,
        payload,
        syncId,
        timestamp,
      });
      if (this.pendingBatch.length >= BATCH_CONFIG.MAX_BATCH_SIZE) {
        this._flushBatch();
      }
    }

    nodeManager.updateSyncStats(sourceNodeId, {
      totalSynced: (nodeManager.nodes.get(sourceNodeId)?.syncStats.totalSynced || 0) + 1,
      lastSyncResult: 'success',
    });

    return {
      success: true,
      syncId,
      logIndex: this.changeLog.length - 1,
      timestamp,
      conflict,
      delta,
      dataKey: payload.dataKey,
      priority,
    };
  }

  async batchPush(sourceNodeId, items) {
    const results = [];
    for (const item of items) {
      const result = await this.pushData(sourceNodeId, item);
      results.push(result);
    }
    this._flushBatch();
    return {
      success: true,
      total: items.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  async pullData(targetNodeId, options = {}) {
    const targetNode = nodeManager.getNodeById(targetNodeId);
    if (!targetNode) {
      return {
        success: false,
        error: '目标节点不存在',
        changes: [],
        currentIndex: this.changeLog.length - 1,
      };
    }

    let changes = this.changeLog;

    if (options.sinceIndex !== undefined && options.sinceIndex !== null) {
      changes = changes.slice(options.sinceIndex + 1);
    }

    if (options.dataKey) {
      changes = changes.filter(entry => entry.dataKey === options.dataKey);
    }

    if (options.deltaOnly) {
      changes = changes.map(entry => ({
        ...entry,
        dataValue: entry.delta || entry.dataValue,
      }));
    }

    if (targetNode.type === NodeType.ONBOARD_TERMINAL) {
      changes = changes.filter(entry =>
        entry.sourceNodeType === NodeType.OCC_CENTER
        || entry.sourceNodeType === NodeType.STATION_NODE
        || entry.sourceNodeId === targetNodeId
      );
    } else if (targetNode.type === NodeType.STATION_NODE) {
      changes = changes.filter(entry =>
        entry.sourceNodeType === NodeType.OCC_CENTER
        || entry.sourceNodeId === targetNodeId
      );
    }

    const newCheckpoint = this.changeLog.length > 0 ? this.changeLog.length - 1 : -1;
    this.syncCheckpoints.set(targetNodeId, newCheckpoint);

    nodeManager.updateSyncStats(targetNodeId, {
      totalSynced: (nodeManager.nodes.get(targetNodeId)?.syncStats.totalSynced || 0) + changes.length,
      lastSyncResult: 'success',
    });

    return {
      success: true,
      changes,
      currentIndex: newCheckpoint,
      pulledCount: changes.length,
      timestamp: Date.now(),
    };
  }

  async pullSnapshot(targetNodeId, options = {}) {
    const targetNode = nodeManager.getNodeById(targetNodeId);
    if (!targetNode) {
      return { success: false, error: '目标节点不存在', snapshot: null };
    }

    const snapshot = this._createSnapshot();
    const checkpoint = this.syncCheckpoints.get(targetNodeId) || -1;

    const incrementalData = {};
    const changesSinceSnapshot = this.changeLog.slice((snapshot.index || 0) + 1);
    for (const change of changesSinceSnapshot) {
      if (targetNode.type === NodeType.ONBOARD_TERMINAL &&
          change.sourceNodeType !== NodeType.OCC_CENTER &&
          change.sourceNodeType !== NodeType.STATION_NODE &&
          change.sourceNodeId !== targetNodeId) {
        continue;
      }
      if (targetNode.type === NodeType.STATION_NODE &&
          change.sourceNodeType !== NodeType.OCC_CENTER &&
          change.sourceNodeId !== targetNodeId) {
        continue;
      }
      incrementalData[change.dataKey] = this.dataStore.get(change.dataKey)?.value;
    }

    return {
      success: true,
      snapshotIndex: snapshot.index,
      checkpoint,
      data: incrementalData,
      fullSnapshot: snapshot.data,
      timestamp: Date.now(),
    };
  }

  async incrementalSync(nodeId) {
    const lastCheckpoint = this.syncCheckpoints.get(nodeId) || -1;
    return this.pullData(nodeId, { sinceIndex: lastCheckpoint, deltaOnly: true });
  }

  async syncToDownstream(sourceNodeId, payload) {
    const sourceNode = nodeManager.nodes.get(sourceNodeId);
    if (!sourceNode) {
      return { success: false, error: '源节点不存在', syncedTo: [] };
    }

    const pushResult = await this.pushData(sourceNodeId, payload);
    if (!pushResult.success) {
      return { success: false, error: pushResult.error, syncedTo: [] };
    }

    const downstreamNodes = this._getDownstreamNodes(sourceNode);
    const syncedTo = [];
    const failedTo = [];

    for (const node of downstreamNodes) {
      if (node.status === NodeStatus.ONLINE) {
        const directCallback = this.directPushCallbacks.get(node.id);
        if (directCallback) {
          try {
            await directCallback(payload.dataKey, payload.dataValue, pushResult.syncId);
            syncedTo.push({ id: node.id, name: node.name, type: node.type, synced: true, method: 'direct' });
            nodeManager.updateSyncStats(node.id, {
              totalSynced: (nodeManager.nodes.get(node.id)?.syncStats.totalSynced || 0) + 1,
              lastSyncResult: 'success',
            });
            continue;
          } catch (err) {
            failedTo.push({ id: node.id, name: node.name, type: node.type, synced: false, reason: 'direct_push_failed' });
          }
        }

        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        if (Math.random() < 0.98) {
          syncedTo.push({
            id: node.id,
            name: node.name,
            type: node.type,
            synced: true,
            method: 'simulated',
          });
          nodeManager.updateSyncStats(node.id, {
            totalSynced: (nodeManager.nodes.get(node.id)?.syncStats.totalSynced || 0) + 1,
            lastSyncResult: 'success',
          });
        } else {
          failedTo.push({
            id: node.id,
            name: node.name,
            type: node.type,
            synced: false,
            reason: 'network_error',
          });
          nodeManager.updateSyncStats(node.id, {
            totalFailed: (nodeManager.nodes.get(node.id)?.syncStats.totalFailed || 0) + 1,
            lastSyncResult: 'failed',
          });
        }
      } else {
        failedTo.push({
          id: node.id,
          name: node.name,
          type: node.type,
          synced: false,
          reason: 'offline',
        });
      }
    }

    this._broadcastSyncEvent(sourceNodeId, payload, pushResult.syncId, syncedTo, failedTo);

    return {
      success: true,
      syncId: pushResult.syncId,
      dataKey: payload.dataKey,
      totalDownstream: downstreamNodes.length,
      syncedCount: syncedTo.length,
      failedCount: failedTo.length,
      syncedTo,
      failedTo,
    };
  }

  getSyncStatus() {
    const nodes = nodeManager.getAllNodes();
    const byType = {
      [NodeType.ONBOARD_TERMINAL]: [],
      [NodeType.STATION_NODE]: [],
      [NodeType.OCC_CENTER]: [],
    };

    for (const node of nodes) {
      if (byType[node.type]) {
        byType[node.type].push({
          id: node.id,
          name: node.name,
          status: node.status,
          lastHeartbeat: node.lastHeartbeat,
          lastSyncTime: node.lastSyncTime,
          syncStats: node.syncStats,
          checkpoint: this.syncCheckpoints.get(node.id) || -1,
          lag: this.changeLog.length > 0
            ? Math.max(0, (this.changeLog.length - 1) - (this.syncCheckpoints.get(node.id) || -1))
            : 0,
        });
      }
    }

    return {
      totalNodes: nodes.length,
      onlineCount: nodes.filter(n => n.status === NodeStatus.ONLINE).length,
      offlineCount: nodes.filter(n => n.status === NodeStatus.OFFLINE).length,
      totalChangesLogged: this.changeLog.length,
      totalDataKeys: this.dataStore.size,
      pendingBatchSize: this.pendingBatch.length,
      quickPathKeys: Array.from(this.quickPathKeys),
      snapshotCount: this.snapshots.size,
      conflictResolution: this.conflictResolution,
      byType,
      timestamp: Date.now(),
    };
  }

  getSnapshots() {
    return Array.from(this.snapshots.values()).map(s => ({
      index: s.index,
      createdAt: s.createdAt,
      keyCount: Object.keys(s.data).length,
    }));
  }

  _flushBatch() {
    if (this.pendingBatch.length === 0) return;

    const batch = this.pendingBatch.splice(0, Math.min(BATCH_CONFIG.MAX_BATCH_SIZE, this.pendingBatch.length));
    const bySource = new Map();

    for (const item of batch) {
      const key = item.sourceNodeId;
      if (!bySource.has(key)) {
        bySource.set(key, []);
      }
      bySource.get(key).push(item);
    }

    for (const [sourceNodeId, items] of bySource.entries()) {
      const sourceNode = nodeManager.nodes.get(sourceNodeId);
      if (!sourceNode) continue;

      const downstreamNodes = this._getDownstreamNodes(sourceNode);
      const syncedTo = [];
      const failedTo = [];

      for (const node of downstreamNodes) {
        if (node.status === NodeStatus.ONLINE) {
          const directCallback = this.directPushCallbacks.get(node.id);
          if (directCallback) {
            try {
              const payloads = items.map(i => ({ key: i.payload.dataKey, value: i.payload.dataValue, syncId: i.syncId }));
              directCallback(null, { batch: payloads }, 'batch');
              syncedTo.push({ id: node.id, name: node.name, itemCount: items.length, method: 'batch_direct' });
              nodeManager.updateSyncStats(node.id, {
                totalSynced: (nodeManager.nodes.get(node.id)?.syncStats.totalSynced || 0) + items.length,
                lastSyncResult: 'success',
              });
            } catch (err) {
              failedTo.push({ id: node.id, name: node.name, reason: 'batch_direct_failed' });
            }
          } else {
            syncedTo.push({ id: node.id, name: node.name, itemCount: items.length, method: 'batch_simulated' });
            nodeManager.updateSyncStats(node.id, {
              totalSynced: (nodeManager.nodes.get(node.id)?.syncStats.totalSynced || 0) + items.length,
              lastSyncResult: 'success',
            });
          }
        } else {
          failedTo.push({ id: node.id, name: node.name, reason: 'offline' });
        }
      }

      this._broadcastSyncEvent(
        sourceNodeId,
        { dataKey: '[batch:' + items.length + ']', dataValue: null },
        uuidv4(),
        syncedTo,
        failedTo,
      );
    }

    console.log('[SyncEngine] 批量同步刷新: ' + batch.length + ' 条数据, 来自 ' + bySource.size + ' 个源');
  }

  _createSnapshot() {
    const index = this.changeLog.length > 0 ? this.changeLog.length - 1 : -1;
    if (index === this.lastSnapshotIndex) {
      const lastKey = Array.from(this.snapshots.keys()).pop();
      return lastKey ? this.snapshots.get(lastKey) : { index, data: {}, createdAt: Date.now() };
    }

    const snapshotData = {};
    for (const [key, entry] of this.dataStore.entries()) {
      snapshotData[key] = entry.value;
    }

    const snapshot = {
      index,
      data: snapshotData,
      createdAt: Date.now(),
    };

    this.snapshots.set(index, snapshot);

    if (this.snapshots.size > SNAPSHOT_CONFIG.MAX_SNAPSHOTS) {
      const oldestKey = this.snapshots.keys().next().value;
      this.snapshots.delete(oldestKey);
    }

    this.lastSnapshotIndex = index;
    return snapshot;
  }

  _pushToDownstreamImmediate(sourceNode, payload, syncId) {
    const downstreamNodes = this._getDownstreamNodes(sourceNode);
    for (const node of downstreamNodes) {
      if (node.status === NodeStatus.ONLINE) {
        const directCallback = this.directPushCallbacks.get(node.id);
        if (directCallback) {
          try {
            directCallback(payload.dataKey, payload.dataValue, syncId);
          } catch (err) {
            console.error('[SyncEngine] 快速路径推送失败:', err);
          }
        }
      }
    }
  }

  _getDownstreamNodes(sourceNode) {
    const allNodes = nodeManager.getAllNodes();
    if (sourceNode.type === NodeType.OCC_CENTER) {
      return allNodes.filter(n =>
        n.type === NodeType.STATION_NODE || n.type === NodeType.ONBOARD_TERMINAL
      );
    } else if (sourceNode.type === NodeType.STATION_NODE) {
      return allNodes.filter(n => n.type === NodeType.ONBOARD_TERMINAL);
    }
    return [];
  }

  _detectConflict(dataKey, newValue, sourceNode) {
    const existing = this.dataStore.get(dataKey);
    if (!existing) {
      return { hasConflict: false };
    }
    if (existing.sourceNodeId === sourceNode.id) {
      return { hasConflict: false };
    }
    return {
      hasConflict: true,
      dataKey,
      existingValue: existing.value,
      existingSourceNodeId: existing.sourceNodeId,
      existingSourceNodeType: existing.sourceNodeType,
      existingLastUpdated: existing.lastUpdated,
      newValue,
      newSourceNodeId: sourceNode.id,
      newSourceNodeType: sourceNode.type,
      detectedAt: Date.now(),
    };
  }

  _resolveConflict(conflict, sourceNode) {
    switch (this.conflictResolution) {
      case ConflictResolution.LAST_WRITE_WIN:
        return { ignored: false, resolvedValue: conflict.newValue, strategy: ConflictResolution.LAST_WRITE_WIN, overwritten: true };
      case ConflictResolution.SOURCE_PRIORITY: {
        const existingPriority = this.sourcePriority[conflict.existingSourceNodeType] || 0;
        const newPriority = this.sourcePriority[sourceNode.type] || 0;
        if (newPriority >= existingPriority) {
          return { ignored: false, resolvedValue: conflict.newValue, strategy: ConflictResolution.SOURCE_PRIORITY, overwritten: true, priorityWon: true };
        }
        return { ignored: true, resolvedValue: conflict.existingValue, strategy: ConflictResolution.SOURCE_PRIORITY, overwritten: false, priorityWon: false };
      }
      case ConflictResolution.MERGE:
        return { ignored: false, resolvedValue: { original: conflict.existingValue, incoming: conflict.newValue }, strategy: ConflictResolution.MERGE, overwritten: false, merged: true };
      default:
        return { ignored: false, resolvedValue: conflict.newValue, strategy: ConflictResolution.LAST_WRITE_WIN };
    }
  }

  _trimChangeLog() {
    if (this.changeLog.length > this.maxChangeLogSize) {
      const overflow = this.changeLog.length - this.maxChangeLogSize;
      this.changeLog.splice(0, overflow);
    }
  }

  _broadcastSyncEvent(sourceNodeId, payload, syncId, syncedTo, failedTo) {
    const sourceNode = nodeManager.nodes.get(sourceNodeId);
    const wsMessage = JSON.stringify({
      type: 'sync:progress',
      data: {
        syncId,
        dataKey: payload.dataKey,
        source: {
          id: sourceNodeId,
          name: sourceNode?.name,
          type: sourceNode?.type,
        },
        totalDownstream: syncedTo.length + failedTo.length,
        syncedCount: syncedTo.length,
        failedCount: failedTo.length,
        syncedTo: syncedTo.map(s => ({ id: s.id, name: s.name, type: s.type })),
        failedTo: failedTo.map(f => ({ id: f.id, name: f.name, type: f.type, reason: f.reason })),
        completedAt: Date.now(),
      },
      timestamp: Date.now(),
    });

    for (const ws of nodeManager.wsClients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(wsMessage);
      }
    }
  }
}

const syncEngine = new SyncEngine();

module.exports = {
  ConflictResolution,
  SyncOperation,
  SyncPriority,
  BATCH_CONFIG,
  SNAPSHOT_CONFIG,
  syncEngine,
  computeDelta,
  applyDelta,
};
