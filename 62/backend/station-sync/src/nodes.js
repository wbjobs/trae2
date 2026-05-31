const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');

// 节点类型枚举
const NodeType = {
  ONBOARD_TERMINAL: 'onboard_terminal', // 车载终端
  STATION_NODE: 'station_node',         // 车站节点
  OCC_CENTER: 'occ_center'              // 运营中心
};

// 节点状态枚举
const NodeStatus = {
  ONLINE: 'online',     // 在线
  OFFLINE: 'offline',   // 离线
  BUSY: 'busy'          // 繁忙
};

class NodeManager {
  constructor() {
    // 存储所有节点信息，key 为节点 ID
    this.nodes = new Map();
    // 存储 WebSocket 客户端，用于推送节点事件
    this.wsClients = new Set();
    // 心跳间隔（毫秒）
    this.heartbeatInterval = 3000;
    // 节点离线超时（毫秒），超过此时间未收到心跳视为离线
    this.offlineTimeout = 15000;
    // 全网广播定时器引用
    this.broadcastTimer = null;
    // 心跳检测定时器引用
    this.heartbeatTimer = null;
  }

  /**
   * 注册一个新节点
   * @param {Object} nodeInfo - 节点信息
   * @param {string} nodeInfo.type - 节点类型
   * @param {string} nodeInfo.name - 节点名称
   * @param {string} [nodeInfo.description] - 节点描述
   * @param {string} [nodeInfo.ip] - 节点 IP 地址
   * @param {number} [nodeInfo.port] - 节点端口
   * @param {Object} [nodeInfo.metadata] - 额外元数据
   * @returns {Object} 已注册的节点对象
   */
  register(nodeInfo) {
    const nodeId = uuidv4();
    const now = Date.now();
    const node = {
      id: nodeId,
      type: nodeInfo.type,
      name: nodeInfo.name,
      description: nodeInfo.description || '',
      ip: nodeInfo.ip || '127.0.0.1',
      port: nodeInfo.port || 0,
      status: NodeStatus.ONLINE,
      metadata: nodeInfo.metadata || {},
      registeredAt: now,
      lastHeartbeat: now,
      lastSyncTime: null,
      syncStats: {
        totalSynced: 0,
        totalFailed: 0,
        lastSyncResult: null
      }
    };
    this.nodes.set(nodeId, node);
    this._broadcastEvent('node:online', {
      node: this._serialize(node),
      timestamp: now
    });
    return node;
  }

  /**
   * 注销一个节点
   * @param {string} nodeId - 节点 ID
   * @returns {boolean} 是否成功注销
   */
  unregister(nodeId) {
    if (this.nodes.has(nodeId)) {
      const node = this.nodes.get(nodeId);
      this.nodes.delete(nodeId);
      this._broadcastEvent('node:offline', {
        nodeId,
        nodeName: node.name,
        nodeType: node.type,
        timestamp: Date.now()
      });
      return true;
    }
    return false;
  }

  /**
   * 接收心跳，更新节点最后心跳时间
   * @param {string} nodeId - 节点 ID
   * @returns {boolean} 是否成功
   */
  heartbeat(nodeId) {
    if (this.nodes.has(nodeId)) {
      const node = this.nodes.get(nodeId);
      node.lastHeartbeat = Date.now();
      if (node.status === NodeStatus.OFFLINE) {
        node.status = NodeStatus.ONLINE;
        this._broadcastEvent('node:online', {
          node: this._serialize(node),
          timestamp: Date.now()
        });
      }
      return true;
    }
    return false;
  }

  /**
   * 获取所有节点列表
   * @param {string} [type] - 可选：按类型过滤
   * @returns {Array} 节点数组
   */
  getAllNodes(type) {
    const result = [];
    for (const node of this.nodes.values()) {
      if (!type || node.type === type) {
        result.push(this._serialize(node));
      }
    }
    return result;
  }

  /**
   * 根据 ID 获取节点详情
   * @param {string} nodeId - 节点 ID
   * @returns {Object|null} 节点对象或 null
   */
  getNodeById(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? this._serialize(node) : null;
  }

  /**
   * 更新节点状态
   * @param {string} nodeId - 节点 ID
   * @param {string} status - 新状态
   * @returns {boolean} 是否成功
   */
  updateStatus(nodeId, status) {
    if (this.nodes.has(nodeId)) {
      const node = this.nodes.get(nodeId);
      const oldStatus = node.status;
      node.status = status;
      this._broadcastEvent('node:status_change', {
        nodeId,
        nodeName: node.name,
        oldStatus,
        newStatus: status,
        timestamp: Date.now()
      });
      return true;
    }
    return false;
  }

  /**
   * 更新节点同步统计
   * @param {string} nodeId - 节点 ID
   * @param {Object} stats - 统计数据
   */
  updateSyncStats(nodeId, stats) {
    if (this.nodes.has(nodeId)) {
      const node = this.nodes.get(nodeId);
      node.lastSyncTime = Date.now();
      node.syncStats = {
        ...node.syncStats,
        ...stats
      };
    }
  }

  /**
   * 注册 WebSocket 客户端
   * @param {WebSocket} ws - WebSocket 连接对象
   */
  registerWsClient(ws) {
    this.wsClients.add(ws);
    // 发送当前所有节点状态
    ws.send(JSON.stringify({
      type: 'nodes:full',
      data: this.getAllNodes(),
      timestamp: Date.now()
    }));
  }

  /**
   * 注销 WebSocket 客户端
   * @param {WebSocket} ws - WebSocket 连接对象
   */
  unregisterWsClient(ws) {
    this.wsClients.delete(ws);
  }

  /**
   * 启动定时任务：心跳检测 + 全网广播
   */
  startScheduler() {
    // 心跳检测：每 5 秒检查一次节点心跳
    this.heartbeatTimer = cron.schedule('*/5 * * * * *', () => {
      this._checkHeartbeats();
    });

    // 全网广播：每 5 秒推送一次全网节点状态
    this.broadcastTimer = cron.schedule('*/5 * * * * *', () => {
      this._broadcastNetworkStatus();
    });

    console.log('[节点管理] 心跳检测与全网广播已启动（每 5 秒）');
  }

  /**
   * 停止定时任务
   */
  stopScheduler() {
    if (this.heartbeatTimer) {
      this.heartbeatTimer.stop();
      this.heartbeatTimer = null;
    }
    if (this.broadcastTimer) {
      this.broadcastTimer.stop();
      this.broadcastTimer = null;
    }
    console.log('[节点管理] 定时任务已停止');
  }

  /**
   * 检查所有节点的心跳状态
   * @private
   */
  _checkHeartbeats() {
    const now = Date.now();
    for (const node of this.nodes.values()) {
      if (node.status !== NodeStatus.OFFLINE) {
        const timeSinceHeartbeat = now - node.lastHeartbeat;
        if (timeSinceHeartbeat > this.offlineTimeout) {
          node.status = NodeStatus.OFFLINE;
          this._broadcastEvent('node:offline', {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            reason: 'heartbeat_timeout',
            timestamp: now
          });
        }
      }
    }
  }

  /**
   * 广播全网节点状态
   * @private
   */
  _broadcastNetworkStatus() {
    this._broadcastEvent('nodes:full', this.getAllNodes());
  }

  /**
   * 向所有 WebSocket 客户端广播事件
   * @param {string} eventType - 事件类型
   * @param {Object} data - 事件数据
   * @private
   */
  _broadcastEvent(eventType, data) {
    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: Date.now()
    });
    for (const ws of this.wsClients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * 序列化节点对象（去除内部引用，便于传输）
   * @param {Object} node - 节点对象
   * @returns {Object} 可序列化的节点对象
   * @private
   */
  _serialize(node) {
    return {
      id: node.id,
      type: node.type,
      name: node.name,
      description: node.description,
      ip: node.ip,
      port: node.port,
      status: node.status,
      metadata: node.metadata,
      registeredAt: node.registeredAt,
      lastHeartbeat: node.lastHeartbeat,
      lastSyncTime: node.lastSyncTime,
      syncStats: node.syncStats
    };
  }
}

// 导出单例实例
const nodeManager = new NodeManager();

module.exports = {
  NodeType,
  NodeStatus,
  nodeManager
};