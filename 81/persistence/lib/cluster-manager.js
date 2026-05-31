const axios = require('axios');
const EventEmitter = require('events');

class ClusterManager extends EventEmitter {
  constructor(mysqlPool, redisClient, currentNodeId = null) {
    super();
    this.mysqlPool = mysqlPool;
    this.redisClient = redisClient;
    this.currentNodeId = currentNodeId;
    this.nodes = new Map();
    this.activeGateways = [];
    this.activePersistence = [];
    this.activeCollectors = [];
    this.healthCheckInterval = 5000;
    this.failoverThreshold = 3;
    this.nodeFailCounts = new Map();
    this.currentGatewayIndex = 0;
    this.currentPersistenceIndex = 0;
    this.clusterStateKey = 'cluster:state';
    this.leaderKey = 'cluster:leader';
    this.leaderTTL = 15000;
    this.isLeader = false;
    this.heartbeatTimer = null;
    this.healthCheckTimer = null;
    this.httpClient = axios.create({
      timeout: 3000,
      maxRedirects: 0
    });
  }

  async init() {
    await this.loadClusterNodes();
    await this.electLeader();
    this.startHeartbeat();
    this.startHealthCheck();
    console.log(`集群管理器已初始化, 当前节点: ${this.currentNodeId || '无'}, Leader: ${this.isLeader ? '是' : '否'}`);
  }

  async loadClusterNodes() {
    const [rows] = await this.mysqlPool.execute(
      `SELECT * FROM cluster_nodes WHERE status IN ('active', 'standby', 'failed')`
    );

    this.nodes.clear();
    rows.forEach(row => {
      const node = {
        id: row.id,
        nodeId: row.node_id,
        nodeType: row.node_type,
        host: row.host,
        port: row.port,
        weight: row.weight,
        status: row.status,
        healthStatus: row.health_status,
        lastHealthCheck: row.last_health_check,
        failoverCount: row.failover_count,
        lastFailoverAt: row.last_failover_at,
        baseUrl: `http://${row.host}:${row.port}`,
        consecutiveFails: 0
      };
      this.nodes.set(node.nodeId, node);
    });

    this.updateActiveLists();
  }

  updateActiveLists() {
    const healthy = node => node.status === 'active' && node.healthStatus === 'healthy';

    this.activeGateways = Array.from(this.nodes.values())
      .filter(n => n.nodeType === 'gateway' && healthy(n))
      .sort((a, b) => b.weight - a.weight);

    this.activePersistence = Array.from(this.nodes.values())
      .filter(n => n.nodeType === 'persistence' && healthy(n))
      .sort((a, b) => b.weight - a.weight);

    this.activeCollectors = Array.from(this.nodes.values())
      .filter(n => n.nodeType === 'collector' && healthy(n))
      .sort((a, b) => b.weight - a.weight);

    if (this.isLeader) {
      this.updateClusterState();
    }
  }

  async electLeader() {
    if (!this.currentNodeId) {
      this.isLeader = false;
      return;
    }

    const result = await this.redisClient.set(
      this.leaderKey,
      this.currentNodeId,
      { NX: true, PX: this.leaderTTL }
    );

    if (result) {
      this.isLeader = true;
      this.emit('leader:elected', { nodeId: this.currentNodeId });
    } else {
      this.isLeader = false;
      const currentLeader = await this.redisClient.get(this.leaderKey);
      console.log(`当前 Leader: ${currentLeader}`);
    }

    setTimeout(() => this.electLeader(), this.leaderTTL * 0.8);
  }

  startHeartbeat() {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 3000);

    this.sendHeartbeat();
  }

  async sendHeartbeat() {
    if (!this.currentNodeId) return;

    try {
      const node = this.nodes.get(this.currentNodeId);
      if (node) {
        node.lastHealthCheck = new Date();
        
        await this.mysqlPool.execute(
          `UPDATE cluster_nodes SET last_health_check = NOW() WHERE node_id = ?`,
          [this.currentNodeId]
        );
      }

      if (this.isLeader) {
        await this.redisClient.set(this.leaderKey, this.currentNodeId, { PX: this.leaderTTL });
      }
    } catch (error) {
      console.error('心跳发送失败:', error.message);
    }
  }

  startHealthCheck() {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);

    this.performHealthCheck();
  }

  async performHealthCheck() {
    if (!this.isLeader) return;

    for (const [nodeId, node] of this.nodes) {
      if (node.nodeId === this.currentNodeId) continue;

      try {
        const startTime = Date.now();
        const response = await this.httpClient.get(`${node.baseUrl}/api/health`);
        const latency = Date.now() - startTime;

        if (response.data && response.data.success) {
          node.healthStatus = latency < 500 ? 'healthy' : 'degraded';
          node.consecutiveFails = 0;
          this.nodeFailCounts.delete(nodeId);
        } else {
          throw new Error('健康检查响应失败');
        }
      } catch (error) {
        node.consecutiveFails++;
        const failCount = (this.nodeFailCounts.get(nodeId) || 0) + 1;
        this.nodeFailCounts.set(nodeId, failCount);

        if (failCount >= this.failoverThreshold) {
          node.healthStatus = 'unhealthy';
          if (node.status === 'active') {
            await this.handleNodeFailure(node);
          }
        } else {
          node.healthStatus = 'degraded';
        }
      }

      if (node.healthStatus !== 'healthy') {
        console.warn(`节点 ${nodeId} 健康状态: ${node.healthStatus}, 连续失败: ${node.consecutiveFails}`);
      }
    }

    await this.persistHealthStatus();
    this.updateActiveLists();
  }

  async handleNodeFailure(failedNode) {
    console.error(`检测到节点故障: ${failedNode.nodeId}, 启动故障转移...`);

    await this.mysqlPool.execute(
      `UPDATE cluster_nodes 
       SET status = 'failed', failover_count = failover_count + 1, last_failover_at = NOW()
       WHERE node_id = ?`,
      [failedNode.nodeId]
    );

    failedNode.status = 'failed';
    failedNode.failoverCount++;
    failedNode.lastFailoverAt = new Date();

    const standbyNodes = Array.from(this.nodes.values())
      .filter(n => n.nodeType === failedNode.nodeType && n.status === 'standby' && n.healthStatus === 'healthy')
      .sort((a, b) => b.weight - a.weight);

    if (standbyNodes.length > 0) {
      const newActive = standbyNodes[0];
      await this.mysqlPool.execute(
        `UPDATE cluster_nodes SET status = 'active' WHERE node_id = ?`,
        [newActive.nodeId]
      );
      newActive.status = 'active';

      this.emit('failover:complete', {
        failedNode: failedNode.nodeId,
        newActiveNode: newActive.nodeId,
        nodeType: failedNode.nodeType
      });

      console.log(`故障转移完成: ${failedNode.nodeId} -> ${newActive.nodeId}`);
    } else {
      this.emit('failover:no_standby', { failedNode: failedNode.nodeId, nodeType: failedNode.nodeType });
      console.error(`没有可用的备用节点来替换故障节点 ${failedNode.nodeId}`);
    }

    this.updateActiveLists();
  }

  async persistHealthStatus() {
    const updates = [];
    for (const node of this.nodes.values()) {
      updates.push(this.mysqlPool.execute(
        `UPDATE cluster_nodes SET health_status = ?, last_health_check = ? WHERE node_id = ?`,
        [node.healthStatus, node.lastHealthCheck, node.nodeId]
      ));
    }
    try {
      await Promise.all(updates);
    } catch (error) {
      console.error('持久化健康状态失败:', error.message);
    }
  }

  async updateClusterState() {
    const state = {
      updatedAt: new Date(),
      leader: this.currentNodeId,
      gateways: this.activeGateways.map(n => ({ nodeId: n.nodeId, host: n.host, port: n.port, weight: n.weight })),
      persistence: this.activePersistence.map(n => ({ nodeId: n.nodeId, host: n.host, port: n.port, weight: n.weight })),
      collectors: this.activeCollectors.map(n => ({ nodeId: n.nodeId, host: n.host, port: n.port, weight: n.weight })),
      stats: {
        totalNodes: this.nodes.size,
        activeGateways: this.activeGateways.length,
        activePersistence: this.activePersistence.length,
        activeCollectors: this.activeCollectors.length,
        failedNodes: Array.from(this.nodes.values()).filter(n => n.status === 'failed').length
      }
    };
    await this.redisClient.setEx(this.clusterStateKey, 30, JSON.stringify(state));
  }

  async getClusterState() {
    try {
      const cached = await this.redisClient.get(this.clusterStateKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {}

    return {
      updatedAt: new Date(),
      gateways: this.activeGateways.map(n => ({ nodeId: n.nodeId, host: n.host, port: n.port, weight: n.weight })),
      persistence: this.activePersistence.map(n => ({ nodeId: n.nodeId, host: n.host, port: n.port, weight: n.weight })),
      collectors: this.activeCollectors.map(n => ({ nodeId: n.nodeId, host: n.host, port: n.port, weight: n.weight }))
    };
  }

  getNextGateway() {
    if (this.activeGateways.length === 0) {
      throw new Error('没有可用的网关节点');
    }
    const node = this.activeGateways[this.currentGatewayIndex % this.activeGateways.length];
    this.currentGatewayIndex++;
    return node;
  }

  getNextPersistence() {
    if (this.activePersistence.length === 0) {
      throw new Error('没有可用的持久化节点');
    }
    const node = this.activePersistence[this.currentPersistenceIndex % this.activePersistence.length];
    this.currentPersistenceIndex++;
    return node;
  }

  async requestWithFailover(nodeType, path, options = {}) {
    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let node;
      try {
        if (nodeType === 'gateway') {
          node = this.getNextGateway();
        } else if (nodeType === 'persistence') {
          node = this.getNextPersistence();
        } else {
          throw new Error(`不支持的节点类型: ${nodeType}`);
        }

        const url = `${node.baseUrl}${path}`;
        const response = await this.httpClient.request({
          url,
          method: options.method || 'GET',
          data: options.data,
          params: options.params,
          timeout: options.timeout || 5000
        });

        return { response, node };
      } catch (error) {
        lastError = error;
        console.warn(`请求 ${node?.nodeId || '未知'} 失败 (尝试 ${attempt + 1}/${maxAttempts}):`, error.message);

        if (node) {
          const failCount = (this.nodeFailCounts.get(node.nodeId) || 0) + 1;
          this.nodeFailCounts.set(node.nodeId, failCount);
          if (failCount >= this.failoverThreshold) {
            node.healthStatus = 'unhealthy';
            if (node.status === 'active') {
              await this.handleNodeFailure(node);
            }
          }
        }

        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  getAllNodes() {
    return Array.from(this.nodes.values()).map(n => ({
      nodeId: n.nodeId,
      nodeType: n.nodeType,
      host: n.host,
      port: n.port,
      weight: n.weight,
      status: n.status,
      healthStatus: n.healthStatus,
      lastHealthCheck: n.lastHealthCheck,
      failoverCount: n.failoverCount,
      lastFailoverAt: n.lastFailoverAt
    }));
  }

  async addNode(nodeConfig) {
    const { nodeId, nodeType, host, port, weight = 10, status = 'standby' } = nodeConfig;

    const [result] = await this.mysqlPool.execute(
      `INSERT INTO cluster_nodes (node_id, node_type, host, port, weight, status, health_status)
       VALUES (?, ?, ?, ?, ?, ?, 'unhealthy')`,
      [nodeId, nodeType, host, port, weight, status]
    );

    const node = {
      id: result.insertId,
      nodeId,
      nodeType,
      host,
      port,
      weight,
      status,
      healthStatus: 'unhealthy',
      lastHealthCheck: null,
      failoverCount: 0,
      lastFailoverAt: null,
      baseUrl: `http://${host}:${port}`,
      consecutiveFails: 0
    };

    this.nodes.set(nodeId, node);
    this.updateActiveLists();

    return node;
  }

  async removeNode(nodeId) {
    await this.mysqlPool.execute(`DELETE FROM cluster_nodes WHERE node_id = ?`, [nodeId]);
    this.nodes.delete(nodeId);
    this.nodeFailCounts.delete(nodeId);
    this.updateActiveLists();
  }

  async setNodeStatus(nodeId, status) {
    await this.mysqlPool.execute(
      `UPDATE cluster_nodes SET status = ? WHERE node_id = ?`,
      [status, nodeId]
    );

    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = status;
    }
    this.updateActiveLists();
  }

  destroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.currentNodeId) {
      this.redisClient.del(this.leaderKey);
    }
  }
}

module.exports = ClusterManager;
