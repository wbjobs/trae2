const net = require('net');
const { CONFIG } = require('./config');
const { EventEmitter } = require('events');

class ClusterManager extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.nodeId = CONFIG.cluster.nodeId;
    this.nodeName = CONFIG.cluster.nodeName;
    this.nodes = new Map();
    this.dataStore = new Map();
    this.dataVersions = new Map();
    this.server = null;
    this.peers = [];
    this.isRunning = false;
    this.versionCounter = 0;
    this.messageIdCounter = 0;
    this.pendingMessages = new Map();
    this.loadMetrics = {
      messageRate: 0,
      messageWindow: [],
      queueDepth: 0,
      activeConnections: 0,
      cpuUsage: 0,
      memoryUsage: 0,
    };
    this.flowControl = {
      incomingRate: 0,
      outgoingRate: 0,
      rateLimit: CONFIG.cluster.maxSyncRate || 1000,
      isRateLimited: false,
      rejectedCount: 0,
    };
    this.syncStats = {
      messagesSent: 0,
      messagesReceived: 0,
      conflicts: 0,
      resolvedConflicts: 0,
      syncTime: Date.now(),
    };
  }

  async init() {
    this._loadPeers();
    await this._startServer();
    this._startHeartbeat();
    this._startLoadMonitoring();
    this._startFlowControl();
    this.logger.info('Cluster', `Node ${this.nodeId} (${this.nodeName}) initialized`);
  }

  _loadPeers() {
    this.peers = CONFIG.cluster.nodes.filter(p => p.id !== this.nodeId);
  }

  _startLoadMonitoring() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.loadMetrics.memoryUsage = memUsage.heapUsed / memUsage.heapTotal;
      const now = Date.now();
      this.loadMetrics.messageWindow = this.loadMetrics.messageWindow.filter(t => now - t < 60000);
      this.loadMetrics.messageRate = this.loadMetrics.messageWindow.length / 60;
      this.loadMetrics.queueDepth = this.dataStore.size;
      this.loadMetrics.activeConnections = this.nodes.size;
    }, 5000);
  }

  _startFlowControl() {
    setInterval(() => {
      const now = Date.now();
      if (this.flowControl.isRateLimited && now - this.flowControl._rateLimitStart > 5000) {
        this.flowControl.isRateLimited = false;
        this.flowControl.incomingRate = 0;
        this.flowControl.outgoingRate = 0;
        this.logger.info('Cluster', 'Flow control disabled, rate limit reset');
      }
    }, 1000);
  }

  _shouldRejectMessage() {
    if (this.flowControl.isRateLimited) return true;
    if (this.loadMetrics.messageRate > this.flowControl.rateLimit) {
      this.flowControl.isRateLimited = true;
      this.flowControl._rateLimitStart = Date.now();
      this.flowControl.rejectedCount++;
      this.logger.warn('Cluster', `Rate limit exceeded: ${this.loadMetrics.messageRate}/s, rejecting messages`);
      return true;
    }
    if (this.loadMetrics.memoryUsage > 0.85) {
      this.flowControl.rejectedCount++;
      this.logger.warn('Cluster', 'Memory usage too high, rejecting non-critical messages');
      return true;
    }
    return false;
  }

  _getLoadScore() {
    return (this.loadMetrics.messageRate / this.flowControl.rateLimit) * 0.4 +
      this.loadMetrics.memoryUsage * 0.3 +
      (this.loadMetrics.activeConnections / Math.max(1, this.peers.length + 1)) * 0.3;
  }

  _shouldRouteToPeer() {
    const myScore = this._getLoadScore();
    const peerScores = Array.from(this.nodes.values())
      .filter(n => n.connected && n.loadScore !== undefined)
      .map(n => n.loadScore);
    if (peerScores.length === 0) return false;
    const minPeerScore = Math.min(...peerScores);
    return myScore > 0.7 && minPeerScore < myScore - 0.2;
  }

  async _startServer() {
    return new Promise((resolve) => {
      const myConfig = CONFIG.cluster.nodes.find(p => p.id === this.nodeId);
      if (!myConfig) {
        this.logger.warn('Cluster', 'Node config not found, skipping server');
        resolve();
        return;
      }
      this.server = net.createServer((socket) => this._handlePeerConnection(socket, null));
      this.server.listen(myConfig.port, myConfig.host, () => {
        this.logger.info('Cluster', `Listening on ${myConfig.host}:${myConfig.port}`);
        this._connectToPeers();
        resolve();
      });
      this.server.on('error', (err) => {
        this.logger.error('Cluster', 'Server error', err);
        resolve();
      });
    });
  }

  _connectToPeers() {
    for (const peer of this.peers) {
      this._connectToPeer(peer);
    }
  }

  _connectToPeer(peer) {
    if (this.nodes.has(peer.id) && this.nodes.get(peer.id).connected) return;
    const socket = new net.Socket();
    let connected = false;
    socket.setTimeout(10000);
    socket.once('connect', () => {
      connected = true;
      this.logger.info('Cluster', `Connected to peer ${peer.id}`);
      this._handlePeerConnection(socket, peer);
    });
    socket.once('timeout', () => {
      if (!connected) {
        this.logger.warn('Cluster', `Connection timeout to peer ${peer.id}`);
        socket.destroy();
      }
    });
    socket.once('error', (err) => {
      if (!connected) {
        this.logger.debug('Cluster', `Connection error to peer ${peer.id}`, err.code);
      }
    });
    socket.once('close', () => {
      if (!connected) this._scheduleReconnect(peer);
    });
    socket.connect(peer.port, peer.host);
  }

  _scheduleReconnect(peer) {
    const node = this.nodes.get(peer.id);
    const attempts = node ? node.reconnectAttempts || 0 : 0;
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
    this.logger.debug('Cluster', `Reconnecting to ${peer.id} in ${delay}ms (attempt ${attempts + 1})`);
    setTimeout(() => this._connectToPeer(peer), delay);
    if (node) node.reconnectAttempts = attempts + 1;
  }

  _handlePeerConnection(socket, peer) {
    const peerId = peer ? peer.id : null;
    const nodeData = {
      id: peerId,
      socket,
      connected: true,
      host: peer ? peer.host : socket.remoteAddress,
      port: peer ? peer.port : socket.remotePort,
      lastSeen: Date.now(),
      reconnectAttempts: 0,
      pendingAcks: new Map(),
      syncVersion: 0,
      loadScore: 0.5,
    };
    if (peerId) this.nodes.set(peerId, nodeData);
    let buffer = '';
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);
    socket.on('data', (data) => {
      buffer += data.toString();
      const messages = buffer.split('\n');
      buffer = messages.pop();
      for (const msg of messages) {
        if (msg.trim()) {
          try {
            this._handleMessage(JSON.parse(msg), nodeData);
          } catch (e) {
            this.logger.error('Cluster', 'Parse error', e.message);
          }
        }
      }
    });
    socket.on('error', (err) => {
      this.logger.warn('Cluster', `Peer ${peerId} error`, err.code);
    });
    socket.on('close', () => {
      this.logger.warn('Cluster', `Peer ${peerId} disconnected`);
      if (peerId) {
        const node = this.nodes.get(peerId);
        if (node) node.connected = false;
        if (peer) this._scheduleReconnect(peer);
      }
      this.emit('peer_disconnected', { peerId });
    });
    this._sendToNode(nodeData, {
      type: 'hello',
      from: this.nodeId,
      nodeName: this.nodeName,
      timestamp: Date.now(),
      version: ++this.versionCounter,
    });
    if (peerId) this._sendFullSync(nodeData);
    this.emit('peer_connected', { peerId });
  }

  _handleMessage(msg, nodeData) {
    if (!msg.from && nodeData.id) msg.from = nodeData.id;
    nodeData.lastSeen = Date.now();
    if (msg.syncVersion !== undefined) nodeData.syncVersion = msg.syncVersion;
    if (msg.loadScore !== undefined) nodeData.loadScore = msg.loadScore;
    this.loadMetrics.messageWindow.push(Date.now());
    if (msg.type !== 'heartbeat' && msg.type !== 'hello') {
      this.logger.debug('Cluster', `Received ${msg.type} from ${msg.from}`, msg.messageId);
    }
    this.syncStats.messagesReceived++;
    if (msg.type !== 'heartbeat' && this._shouldRejectMessage()) {
      this.flowControl.rejectedCount++;
      this.logger.warn('Cluster', `Rejecting ${msg.type} from ${msg.from} due to flow control`);
      return;
    }
    switch (msg.type) {
      case 'hello':
        this._handleHello(msg, nodeData);
        break;
      case 'heartbeat':
        break;
      case 'sync':
        this._handleSyncData(msg);
        break;
      case 'sync_ack':
        this._handleSyncAck(msg);
        break;
      case 'full_sync_request':
        this._sendFullSync(nodeData);
        break;
      case 'full_sync_response':
        this._handleSyncData(msg);
        break;
      case 'broadcast':
        this._handleBroadcast(msg);
        break;
      case 'direct':
        this._handleDirect(msg);
        break;
      default:
        this.logger.debug('Cluster', 'Unknown message type', msg.type);
    }
  }

  _handleHello(msg, nodeData) {
    if (!nodeData.id && msg.from) {
      nodeData.id = msg.from;
      this.nodes.set(msg.from, nodeData);
      this.logger.info('Cluster', `Peer ${msg.from} (${msg.nodeName}) connected`);
    }
    if (msg.version !== undefined && this.versionCounter < msg.version) {
      this.versionCounter = msg.version;
      this._sendFullSync(nodeData);
    }
  }

  _handleSyncData(msg) {
    let updatedCount = 0;
    let conflictCount = 0;
    for (const [key, value] of Object.entries(msg.data)) {
      const existing = this.dataStore.get(key);
      if (!existing) {
        this.dataStore.set(key, value);
        this.dataVersions.set(key, msg.version || Date.now());
        updatedCount++;
      } else {
        const existingTime = existing.updatedAt || existing.syncedAt || 0;
        const incomingTime = value.updatedAt || value.syncedAt || 0;
        if (incomingTime > existingTime) {
          this.dataStore.set(key, value);
          this.dataVersions.set(key, msg.version || Date.now());
          updatedCount++;
        } else if (incomingTime === existingTime) {
          if (JSON.stringify(value) !== JSON.stringify(existing)) {
            conflictCount++;
            this.syncStats.conflicts++;
            if (msg.from > this.nodeId) {
              this.dataStore.set(key, value);
              this.dataVersions.set(key, msg.version || Date.now());
              this.syncStats.resolvedConflicts++;
            }
          }
        }
      }
    }
    this.logger.info('Cluster', `Sync from ${msg.from}: ${updatedCount} updated, ${conflictCount} conflicts`);
    if (msg.messageId) this._sendToNode(this.nodes.get(msg.from), {
      type: 'sync_ack', messageId: msg.messageId, version: ++this.versionCounter,
    });
    this.syncStats.syncTime = Date.now();
    this.emit('data_synced', { source: msg.from, updatedCount, conflictCount });
  }

  _handleSyncAck(msg) {
    const pending = this.pendingMessages.get(msg.messageId);
    if (pending) {
      pending.resolve(true);
      this.pendingMessages.delete(msg.messageId);
    }
  }

  _handleBroadcast(msg) {
    this.emit('broadcast', msg.payload);
    if (msg.data && this._shouldRejectMessage() === false) {
      this._handleSyncData(msg);
    }
  }

  _handleDirect(msg) {
    this.emit('direct_message', { from: msg.from, payload: msg.payload });
  }

  _sendFullSync(node) {
    if (!node || !node.connected) return;
    const entries = Array.from(this.dataStore.entries());
    const batchSize = 100;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = Object.fromEntries(entries.slice(i, i + batchSize));
      const msg = {
        type: i === 0 ? 'full_sync_response' : 'sync',
        from: this.nodeId,
        data: batch,
        version: ++this.versionCounter,
        timestamp: Date.now(),
        isFullSync: i === 0,
        batchIndex: Math.floor(i / batchSize),
        totalBatches: Math.ceil(entries.length / batchSize),
        loadScore: this._getLoadScore(),
        syncVersion: this.versionCounter,
      };
      this._sendToNode(node, msg);
    }
    if (entries.length === 0) {
      this._sendToNode(node, {
        type: 'full_sync_response', from: this.nodeId, data: {}, version: ++this.versionCounter,
        loadScore: this._getLoadScore(), syncVersion: this.versionCounter,
      });
    }
  }

  _sendToNode(node, msg) {
    if (!node || !node.connected || !node.socket || node.socket.destroyed) return;
    if (this.flowControl.isRateLimited && msg.type !== 'heartbeat' && msg.type !== 'sync_ack') {
      this.logger.debug('Cluster', `Skipping send to ${node.id} due to rate limit`);
      return;
    }
    try {
      node.socket.write(JSON.stringify(msg) + '\n');
      this.syncStats.messagesSent++;
      this.flowControl.outgoingRate++;
      return true;
    } catch (e) {
      this.logger.error('Cluster', `Send error to ${node.id}`, e.message);
      return false;
    }
  }

  broadcast(type, payload) {
    const msg = {
      type: 'broadcast', from: this.nodeId, payload,
      version: ++this.versionCounter, timestamp: Date.now(),
      loadScore: this._getLoadScore(),
    };
    let sent = 0;
    for (const node of this.nodes.values()) {
      if (node.connected && this._sendToNode(node, msg)) sent++;
    }
    return sent;
  }

  sendTo(peerId, type, payload) {
    const node = this.nodes.get(peerId);
    if (!node || !node.connected) return false;
    return this._sendToNode(node, {
      type: 'direct', from: this.nodeId, payload,
      version: ++this.versionCounter, timestamp: Date.now(),
    });
  }

  set(key, value, options = {}) {
    const entry = {
      value,
      updatedAt: Date.now(),
      syncedAt: Date.now(),
      sourceNode: this.nodeId,
      ttl: options.ttl,
      metadata: options.metadata,
    };
    this.dataStore.set(key, entry);
    this.dataVersions.set(key, ++this.versionCounter);
    if (options.sync !== false) {
      const data = { [key]: entry };
      for (const node of this.nodes.values()) {
        if (node.connected) {
          this._sendToNode(node, {
            type: 'sync', from: this.nodeId, data,
            version: this.versionCounter, timestamp: Date.now(),
            messageId: ++this.messageIdCounter,
            loadScore: this._getLoadScore(),
            syncVersion: this.versionCounter,
          });
        }
      }
    }
    this.emit('data_changed', { key, value: entry });
    return true;
  }

  get(key) {
    const entry = this.dataStore.get(key);
    return entry ? entry.value : null;
  }

  has(key) {
    return this.dataStore.has(key);
  }

  delete(key) {
    this.dataStore.delete(key);
    this.dataVersions.delete(key);
    const data = { [key]: null };
    for (const node of this.nodes.values()) {
      if (node.connected) {
        this._sendToNode(node, {
          type: 'sync', from: this.nodeId, data,
          version: ++this.versionCounter, timestamp: Date.now(),
        });
      }
    }
    this.emit('data_deleted', { key });
  }

  getAll() {
    const result = {};
    for (const [key, entry] of this.dataStore.entries()) {
      result[key] = entry.value;
    }
    return result;
  }

  _startHeartbeat() {
    setInterval(() => {
      const now = Date.now();
      const nodeList = [];
      for (const [id, node] of this.nodes) {
        const isAlive = now - node.lastSeen < CONFIG.cluster.heartbeatInterval * 3;
        if (!isAlive && node.connected) {
          this.logger.warn('Cluster', `Peer ${id} seems dead, last seen ${now - node.lastSeen}ms ago`);
          node.connected = false;
          this.emit('peer_disconnected', { peerId: id });
        }
        nodeList.push({ id, name: id, connected: node.connected, lastSeen: node.lastSeen, loadScore: node.loadScore });
      }
      this.nodeList = nodeList;
      const msg = {
        type: 'heartbeat', from: this.nodeId,
        version: this.versionCounter, timestamp: now,
        loadScore: this._getLoadScore(),
        syncVersion: this.versionCounter,
        loadMetrics: {
          messageRate: this.loadMetrics.messageRate,
          memoryUsage: this.loadMetrics.memoryUsage,
          activeConnections: this.loadMetrics.activeConnections,
        },
      };
      for (const node of this.nodes.values()) {
        if (node.connected) this._sendToNode(node, msg);
      }
    }, CONFIG.cluster.heartbeatInterval);
  }

  getNodes() {
    return Array.from(this.nodes.entries()).map(([id, node]) => ({
      id, name: id, connected: node.connected, host: node.host, port: node.port,
      lastSeen: node.lastSeen, reconnectAttempts: node.reconnectAttempts || 0,
      pendingAcks: node.pendingAcks ? node.pendingAcks.size : 0,
      loadScore: node.loadScore, syncVersion: node.syncVersion,
    }));
  }

  getStats() {
    return {
      nodeId: this.nodeId, nodeName: this.nodeName,
      connectedNodes: Array.from(this.nodes.values()).filter(n => n.connected).length,
      totalNodes: this.nodes.size,
      dataStoreSize: this.dataStore.size,
      version: this.versionCounter,
      syncStats: this.syncStats,
      loadMetrics: this.loadMetrics,
      flowControl: {
        ...this.flowControl,
        shouldReject: this._shouldRejectMessage(),
        loadScore: this._getLoadScore(),
        shouldRoute: this._shouldRouteToPeer(),
      },
    };
  }

  async shutdown() {
    this.isRunning = false;
    if (this.server) this.server.close();
    for (const node of this.nodes.values()) {
      if (node.socket) node.socket.destroy();
    }
    this.logger.info('Cluster', 'Cluster manager shut down');
  }
}

module.exports = ClusterManager;
