const EventEmitter = require('events');
const axios = require('axios');
const config = require('../../config/config');
const logger = require('../modules/logger');

class NodeSyncQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxParallel = config.nodes.maxParallelSyncs || 4;
    this.activeCount = 0;
  }

  push(task) {
    this.queue.push({
      ...task,
      addedAt: Date.now(),
      priority: task.priority || 0
    });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.processNext();
  }

  async processNext() {
    if (this.processing || this.activeCount >= this.maxParallel) return;
    if (this.queue.length === 0) return;

    const task = this.queue.shift();
    this.activeCount++;
    this.processing = true;

    try {
      await task.handler(task.data);
      if (task.callback) task.callback(null, task.data);
    } catch (error) {
      logger.error(`Sync task failed: ${error.message}`);
      if (task.callback) task.callback(error, task.data);
    } finally {
      this.activeCount--;
      this.processing = false;
      this.processNext();
    }
  }

  size() {
    return this.queue.length + this.activeCount;
  }

  clear() {
    this.queue = [];
  }
}

class SyncService extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.nodes = new Map();
    this.groundSyncQueue = [];
    this.nodeSyncInterval = null;
    this.groundSyncInterval = null;
    this.heartbeatCheckInterval = null;
    this.incrementalSyncInterval = null;
    this.trainLine = process.env.TRAIN_LINE || 'Line-1';
    this.vehicleId = process.env.VEHICLE_ID || 'V-001';
    this.nodeSyncQueue = new NodeSyncQueue();
    this.nodeVersions = new Map();
    this.deltaHistory = new Map();
    this.lastFullSync = 0;
    this.failedSyncs = [];
    this.syncStats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageSyncTime: 0,
      lastSyncTime: 0
    };
  }

  async start() {
    if (this.running) return;
    this.running = true;

    this.initializeSimulatedNodes();
    
    if (config.nodes.fastSyncOnStartup) {
      await this.performFullSync();
    }

    this.startNodeSync();
    this.startGroundSync();
    this.startHeartbeatCheck();
    
    if (config.nodes.incrementalSync) {
      this.startIncrementalSync();
    }

    if (config.nodes.deltaSyncEnabled) {
      this.startDeltaSync();
    }

    logger.info(`Node sync service started with ${config.nodes.maxParallelSyncs} parallel syncs`);
  }

  initializeSimulatedNodes() {
    const nodeCount = 8;
    for (let i = 1; i <= nodeCount; i++) {
      const nodeId = `NODE-${String(i).padStart(3, '0')}`;
      const isPriority = config.nodes.priorityNodes.includes(nodeId);
      this.nodes.set(nodeId, {
        id: nodeId,
        name: `车载节点 ${i}`,
        type: i <= 3 ? 'HEAD_END' : i <= 6 ? 'MID_TRAIN' : 'TAIL_END',
        position: i,
        status: 'online',
        vehicleId: this.vehicleId,
        trainLine: this.trainLine,
        ip: `192.168.1.${10 + i}`,
        priority: isPriority ? 100 : 50,
        hardware: {
          model: 'RCU-2000',
          firmware: 'v2.3.1',
          serial: `SN${Date.now()}${i}`
        },
        channels: [],
        lastHeartbeat: Date.now(),
        cpuUsage: 0,
        memoryUsage: 0,
        temperature: 0,
        uptime: 0,
        registeredAt: Date.now(),
        version: 0,
        lastSyncTime: 0,
        syncInterval: isPriority ? 1000 : 3000,
        location: {
          km: Math.random() * 30,
          station: this.getRandomStation(),
          speed: 0 + Math.random() * 120,
          direction: Math.random() > 0.5 ? 'up' : 'down'
        },
        metrics: {
          totalPackets: 0,
          lostPackets: 0,
          retransmissions: 0,
          connectionCount: 0,
          lastUpdate: 0
        },
        changedFields: []
      });
      this.nodeVersions.set(nodeId, 0);
    }

    logger.info(`Initialized ${this.nodes.size} simulated nodes`);
  }

  getRandomStation() {
    const stations = ['北京南站', '天津站', '济南西站', '徐州东站', '南京南站', '上海虹桥站'];
    return stations[Math.floor(Math.random() * stations.length)];
  }

  startNodeSync() {
    this.nodeSyncInterval = setInterval(() => {
      if (!this.running) return;
      this.syncNodes();
    }, config.nodes.syncInterval);
  }

  startIncrementalSync() {
    this.incrementalSyncInterval = setInterval(() => {
      if (!this.running) return;
      this.performIncrementalSync();
    }, config.nodes.incrementalSyncInterval || 1000);
  }

  startDeltaSync() {
    setInterval(() => {
      if (!this.running) return;
      this.collectDeltaChanges();
    }, 500);
  }

  syncNodes() {
    const now = Date.now();
    
    this.nodes.forEach((node, nodeId) => {
      if (now - node.lastSyncTime < node.syncInterval) return;

      if (Math.random() > 0.02) {
        const changes = [];
        
        if (node.status !== 'online') {
          changes.push('status');
        }
        node.status = 'online';
        node.lastHeartbeat = now;
        
        const newCpu = 20 + Math.random() * 60;
        if (Math.abs(node.cpuUsage - newCpu) > 5) {
          node.cpuUsage = newCpu;
          changes.push('cpuUsage');
        }
        
        const newMemory = 30 + Math.random() * 40;
        if (Math.abs(node.memoryUsage - newMemory) > 5) {
          node.memoryUsage = newMemory;
          changes.push('memoryUsage');
        }
        
        const newTemp = 35 + Math.random() * 25;
        if (Math.abs(node.temperature - newTemp) > 3) {
          node.temperature = newTemp;
          changes.push('temperature');
        }

        node.uptime = now - node.registeredAt;
        node.location.km = (node.location.km + 0.01 + Math.random() * 0.05) % 30;
        node.location.speed = 60 + Math.random() * 120;
        
        if (Math.random() > 0.9) {
          node.location.station = this.getRandomStation();
          changes.push('station');
        }

        node.metrics.totalPackets += Math.floor(Math.random() * 100);
        const lost = Math.random() > 0.95 ? Math.floor(Math.random() * 5) : 0;
        node.metrics.lostPackets += lost;
        node.metrics.connectionCount = Math.floor(Math.random() * 20);
        node.metrics.lastUpdate = now;

        node.version++;
        node.lastSyncTime = now;
        node.changedFields = changes;

        if (changes.length > 0 || config.nodes.priorityNodes.includes(nodeId)) {
          this.queueNodeSync(node);
        }
      } else {
        if (Math.random() > 0.98) {
          node.status = 'offline';
          node.changedFields = ['status'];
          this.queueNodeSync(node);
          logger.warn(`Node ${nodeId} went offline`);
        }
      }
    });
  }

  queueNodeSync(node) {
    const priority = node.priority || 50;
    
    this.nodeSyncQueue.push({
      id: `sync-${node.id}-${Date.now()}`,
      priority,
      data: node,
      handler: async (nodeData) => {
        await this.processNodeSync(nodeData);
      },
      callback: (error, data) => {
        if (error) {
          this.syncStats.failedSyncs++;
        } else {
          this.syncStats.successfulSyncs++;
        }
      }
    });
  }

  async processNodeSync(node) {
    const deltaData = this.getDeltaChanges(node);
    
    this.emit('nodeUpdate', { 
      ...node, 
      delta: deltaData,
      isDelta: deltaData.changedFields.length > 0
    });

    this.deltaHistory.set(node.id, {
      version: node.version,
      changedFields: node.changedFields,
      timestamp: Date.now()
    });

    node.changedFields = [];
  }

  getDeltaChanges(node) {
    const lastDelta = this.deltaHistory.get(node.id);
    if (!lastDelta) {
      return {
        isFull: true,
        changedFields: Object.keys(node),
        data: node
      };
    }

    return {
      isFull: false,
      changedFields: node.changedFields || [],
      lastVersion: lastDelta.version,
      currentVersion: node.version
    };
  }

  collectDeltaChanges() {
    this.nodes.forEach(node => {
      if (node.changedFields && node.changedFields.length > 0) {
        this.deltaHistory.set(node.id, {
          version: node.version,
          changedFields: [...node.changedFields],
          timestamp: Date.now()
        });
      }
    });
  }

  async performFullSync() {
    logger.info('Performing full node sync...');
    this.lastFullSync = Date.now();
    
    const nodes = [];
    this.nodes.forEach(node => {
      nodes.push({ ...node, isFull: true });
    });

    this.emit('fullSync', {
      timestamp: Date.now(),
      nodeCount: nodes.length,
      nodes
    });

    nodes.forEach(node => {
      this.emit('nodeUpdate', { ...node, isFull: true });
    });

    logger.info(`Full sync completed: ${nodes.length} nodes`);
  }

  async performIncrementalSync() {
    const changedNodes = [];
    this.nodes.forEach(node => {
      if (node.changedFields && node.changedFields.length > 0) {
        changedNodes.push({
          id: node.id,
          version: node.version,
          changedFields: [...node.changedFields],
          timestamp: Date.now()
        });
      }
    });

    if (changedNodes.length > 0) {
      this.emit('incrementalSync', {
        timestamp: Date.now(),
        count: changedNodes.length,
        nodes: changedNodes
      });
    }
  }

  startHeartbeatCheck() {
    this.heartbeatCheckInterval = setInterval(() => {
      if (!this.running) return;
      this.checkHeartbeats();
    }, config.nodes.heartbeatInterval);
  }

  checkHeartbeats() {
    const now = Date.now();
    const timeoutThreshold = config.nodes.timeoutThreshold;

    this.nodes.forEach((node, nodeId) => {
      const timeSinceHeartbeat = now - node.lastHeartbeat;
      
      if (node.status === 'online' && timeSinceHeartbeat > timeoutThreshold) {
        node.status = 'timeout';
        node.changedFields = ['status'];
        this.queueNodeSync(node);
        logger.warn(`Node ${nodeId} heartbeat timeout after ${timeSinceHeartbeat}ms`);
        this.emit('nodeTimeout', { nodeId, timeout: timeSinceHeartbeat });
      } else if (node.status === 'timeout' && timeSinceHeartbeat < timeoutThreshold) {
        node.status = 'online';
        node.changedFields = ['status'];
        this.queueNodeSync(node);
        logger.info(`Node ${nodeId} recovered`);
        this.emit('nodeRecovered', { nodeId });
      }
    });
  }

  startGroundSync() {
    this.groundSyncInterval = setInterval(() => {
      if (!this.running) return;
      this.syncToGround();
    }, config.ground.syncInterval);
  }

  async syncToGround() {
    const startTime = Date.now();
    const syncData = this.prepareSyncData();
    
    this.groundSyncQueue.push(syncData);
    
    if (this.groundSyncQueue.length > 100) {
      this.groundSyncQueue.shift();
    }

    try {
      await this.sendToGround(syncData);
      const syncTime = Date.now() - startTime;
      
      this.syncStats.totalSyncs++;
      this.syncStats.successfulSyncs++;
      this.syncStats.lastSyncTime = syncTime;
      this.syncStats.averageSyncTime = 
        (this.syncStats.averageSyncTime * (this.syncStats.successfulSyncs - 1) + syncTime) / 
        this.syncStats.successfulSyncs;

      this.emit('groundSync', {
        timestamp: Date.now(),
        count: syncData.nodes.length,
        status: 'success',
        syncTime
      });

      if (this.failedSyncs.length > 0) {
        this.retryFailedSyncs();
      }

      logger.debug(`Ground sync completed: ${syncData.nodes.length} nodes in ${syncTime}ms`);
    } catch (error) {
      this.syncStats.totalSyncs++;
      this.syncStats.failedSyncs++;
      
      this.failedSyncs.push({
        data: syncData,
        error: error.message,
        timestamp: Date.now(),
        retryCount: 0
      });

      if (this.failedSyncs.length > 50) {
        this.failedSyncs = this.failedSyncs.slice(-50);
      }

      logger.error(`Ground sync failed: ${error.message}`);
      this.emit('groundSync', {
        timestamp: Date.now(),
        count: 0,
        status: 'failed',
        error: error.message
      });
    }
  }

  async retryFailedSyncs() {
    const retryable = this.failedSyncs.filter(s => s.retryCount < config.ground.maxRetry);
    
    for (const sync of retryable) {
      try {
        await this.sendToGround(sync.data);
        sync.retryCount = -1;
        logger.info(`Retried sync succeeded: ${sync.data.vehicleId}`);
      } catch (error) {
        sync.retryCount++;
        logger.warn(`Retry ${sync.retryCount} failed for ${sync.data.vehicleId}: ${error.message}`);
      }
    }

    this.failedSyncs = this.failedSyncs.filter(s => s.retryCount >= 0 && s.retryCount < config.ground.maxRetry);
  }

  prepareSyncData() {
    const nodes = [];
    this.nodes.forEach(node => {
      const hasChanges = node.changedFields && node.changedFields.length > 0;
      
      if (hasChanges || config.nodes.deltaSyncEnabled) {
        nodes.push({
          id: node.id,
          name: node.name,
          type: node.type,
          status: node.status,
          position: node.position,
          priority: node.priority,
          version: node.version,
          cpuUsage: node.cpuUsage,
          memoryUsage: node.memoryUsage,
          temperature: node.temperature,
          lastHeartbeat: node.lastHeartbeat,
          changedFields: node.changedFields,
          location: node.location,
          metrics: node.metrics
        });
      }
    });

    return {
      vehicleId: this.vehicleId,
      trainLine: this.trainLine,
      timestamp: Date.now(),
      syncType: nodes.every(n => n.changedFields.length === 0) ? 'DELTA_SYNC' : 'PARTIAL_SYNC',
      nodeCount: nodes.length,
      nodes,
      channelSummary: this.getChannelSummary()
    };
  }

  getChannelSummary() {
    return {
      totalChannels: 24,
      activeChannels: Math.floor(20 + Math.random() * 4),
      averageSnr: 25 + Math.random() * 10,
      averagePacketLoss: Math.random() * 1,
      alerts: Math.floor(Math.random() * 3),
      updatedAt: Date.now()
    };
  }

  async sendToGround(data) {
    const groundUrl = config.ground.serverUrl + '/api/vehicle/sync';
    
    try {
      const response = await axios.post(groundUrl, data, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Vehicle-ID': this.vehicleId,
          'X-Train-Line': this.trainLine,
          'X-Sync-Type': data.syncType
        }
      });
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        logger.warn('Ground server unavailable, data queued');
        return { status: 'queued' };
      }
      throw error;
    }
  }

  async registerNode(nodeInfo) {
    const nodeId = nodeInfo.id || `NODE-${Date.now()}`;
    
    const node = {
      id: nodeId,
      name: nodeInfo.name || nodeId,
      type: nodeInfo.type || 'MID_TRAIN',
      position: nodeInfo.position || this.nodes.size + 1,
      status: 'registering',
      vehicleId: this.vehicleId,
      trainLine: this.trainLine,
      ip: nodeInfo.ip || 'unknown',
      priority: nodeInfo.priority || 50,
      hardware: nodeInfo.hardware || {},
      channels: [],
      lastHeartbeat: Date.now(),
      cpuUsage: 0,
      memoryUsage: 0,
      temperature: 0,
      uptime: 0,
      registeredAt: Date.now(),
      version: 0,
      lastSyncTime: 0,
      syncInterval: 3000,
      location: nodeInfo.location || { km: 0, station: 'Unknown', speed: 0 },
      metrics: {
        totalPackets: 0,
        lostPackets: 0,
        retransmissions: 0,
        connectionCount: 0,
        lastUpdate: 0
      },
      changedFields: Object.keys(nodeInfo)
    };

    this.nodes.set(nodeId, node);
    this.nodeVersions.set(nodeId, 0);
    node.status = 'online';
    
    this.queueNodeSync(node);
    
    logger.info(`Node registered: ${nodeId} (priority: ${node.priority})`);
    this.emit('nodeUpdate', { ...node, isNew: true });
    this.emit('nodeRegistered', node);

    return node;
  }

  async unregisterNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);
      this.nodeVersions.delete(nodeId);
      this.deltaHistory.delete(nodeId);
      logger.info(`Node unregistered: ${nodeId}`);
      this.emit('nodeUnregistered', { nodeId, timestamp: Date.now() });
      return true;
    }
    return false;
  }

  async updateNodeStatus(nodeId, status) {
    const node = this.nodes.get(nodeId);
    if (node) {
      if (node.status !== status) {
        node.status = status;
        node.changedFields = node.changedFields || [];
        if (!node.changedFields.includes('status')) {
          node.changedFields.push('status');
        }
      }
      node.lastHeartbeat = Date.now();
      this.queueNodeSync(node);
      return node;
    }
    return null;
  }

  async getAllNodes() {
    const nodes = [];
    this.nodes.forEach(node => {
      nodes.push({ 
        ...node, 
        delta: this.getDeltaChanges(node)
      });
    });
    return nodes.sort((a, b) => a.position - b.position);
  }

  async getNodeById(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return null;
    return { 
      ...node, 
      delta: this.getDeltaChanges(node)
    };
  }

  getNodeStatistics() {
    let online = 0;
    let offline = 0;
    let timeout = 0;
    let avgCpu = 0;
    let avgMemory = 0;
    let avgTemp = 0;
    let totalPackets = 0;
    let totalLost = 0;

    this.nodes.forEach(node => {
      if (node.status === 'online') online++;
      else if (node.status === 'offline') offline++;
      else if (node.status === 'timeout') timeout++;

      avgCpu += node.cpuUsage;
      avgMemory += node.memoryUsage;
      avgTemp += node.temperature;
      totalPackets += node.metrics.totalPackets;
      totalLost += node.metrics.lostPackets;
    });

    const total = this.nodes.size;

    return {
      totalNodes: total,
      onlineNodes: online,
      offlineNodes: offline,
      timeoutNodes: timeout,
      averageCpuUsage: total > 0 ? avgCpu / total : 0,
      averageMemoryUsage: total > 0 ? avgMemory / total : 0,
      averageTemperature: total > 0 ? avgTemp / total : 0,
      totalPackets,
      totalLost,
      overallPacketLossRate: totalPackets > 0 ? (totalLost / totalPackets * 100) : 0,
      syncQueueSize: this.nodeSyncQueue.size(),
      syncStats: { ...this.syncStats },
      failedSyncCount: this.failedSyncs.length,
      lastFullSync: this.lastFullSync
    };
  }

  async getSyncQueue() {
    return {
      pending: this.nodeSyncQueue.size(),
      active: this.nodeSyncQueue.activeCount,
      failed: this.failedSyncs.length,
      groundQueueSize: this.groundSyncQueue.length
    };
  }

  async forceGroundSync() {
    logger.info('Forcing ground sync');
    await this.performFullSync();
    return this.syncToGround();
  }

  async stop() {
    this.running = false;

    if (this.nodeSyncInterval) {
      clearInterval(this.nodeSyncInterval);
      this.nodeSyncInterval = null;
    }

    if (this.groundSyncInterval) {
      clearInterval(this.groundSyncInterval);
      this.groundSyncInterval = null;
    }

    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }

    if (this.incrementalSyncInterval) {
      clearInterval(this.incrementalSyncInterval);
      this.incrementalSyncInterval = null;
    }

    this.nodeSyncQueue.clear();

    logger.info('Node sync service stopped');
  }
}

const syncService = new SyncService();

if (require.main === module) {
  syncService.start();
}

module.exports = syncService;
