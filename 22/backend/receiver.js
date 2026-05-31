const net = require('net');
const dgram = require('dgram');
const { EventEmitter } = require('events');
const { CONFIG } = require('./config');
const { RateLimiter, CircuitBreaker } = require('./ratelimit');
const { TraceManager } = require('./tracing');

const SID_MAP = {
  '0x10': 'DiagnosticSessionControl',
  '0x11': 'ECUReset',
  '0x14': 'ClearDiagnosticInformation',
  '0x19': 'ReadDTCInformation',
  '0x22': 'ReadDataByIdentifier',
  '0x23': 'ReadMemoryByAddress',
  '0x24': 'ReadScalingDataByIdentifier',
  '0x27': 'SecurityAccess',
  '0x28': 'CommunicationControl',
  '0x2A': 'ReadDataByPeriodicIdentifier',
  '0x2C': 'DynamicallyDefineDataIdentifier',
  '0x2E': 'WriteDataByIdentifier',
  '0x2F': 'InputOutputControlByIdentifier',
  '0x31': 'RoutineControl',
  '0x34': 'RequestDownload',
  '0x35': 'RequestUpload',
  '0x36': 'TransferData',
  '0x37': 'RequestTransferExit',
  '0x38': 'RequestFileTransfer',
  '0x3D': 'WriteMemoryByAddress',
  '0x3E': 'TesterPresent',
  '0x85': 'ControlDTCSetting',
};

class ECUMessageReceiver extends EventEmitter {
  constructor(logger, threadPool = null, traceManager = null) {
    super();
    this.logger = logger;
    this.threadPool = threadPool;
    this.traceManager = traceManager || new TraceManager();
    this.messageBuffer = [];
    this.maxBufferSize = CONFIG.ecu.messageBufferSize;
    this.tcpServer = null;
    this.udpServer = null;
    this.isRunning = false;
    this.useThreadPool = !!threadPool;
    this.useTracing = !!traceManager;
    this.stats = {
      totalMessages: 0,
      tcpMessages: 0,
      udpMessages: 0,
      blockedMessages: 0,
      forwardedMessages: 0,
      errors: 0,
      droppedMessages: 0,
      processedByWorker: 0,
      tracedMessages: 0,
    };
    this.rateLimiter = new RateLimiter({
      maxRequests: 5000,
      windowMs: 1000,
      maxConcurrency: 200,
      highWaterMark: 10000,
    });
    this.tcpCircuitBreaker = new CircuitBreaker({
      failureThreshold: 10,
      successThreshold: 3,
      timeoutMs: 30000,
    });
    this.udpCircuitBreaker = new CircuitBreaker({
      failureThreshold: 20,
      successThreshold: 5,
      timeoutMs: 10000,
    });
    this.processingQueue = [];
    this.isProcessing = false;
    this.maxQueueSize = 5000;
  }

  _parseMessage(raw, protocol) {
    try {
      const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'hex');
      if (buffer.length < 2) {
        throw new Error('Message too short');
      }
      const sid = '0x' + buffer[0].toString(16).toUpperCase().padStart(2, '0');
      const sidName = SID_MAP[sid] || 'Unknown';
      let did = null;
      if (['0x22', '0x2E', '0x2F'].includes(sid) && buffer.length >= 3) {
        did = '0x' + buffer.slice(1, 3).toString('hex').toUpperCase();
      }
      let subFunction = null;
      if (['0x10', '0x11', '0x28', '0x27', '0x31', '0x85'].includes(sid) && buffer.length >= 2) {
        subFunction = '0x' + buffer[1].toString(16).toUpperCase().padStart(2, '0');
      }
      return {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        protocol,
        sid,
        sidName,
        subFunction,
        did,
        data: buffer.toString('hex').toUpperCase(),
        length: buffer.length,
        raw: buffer,
        sourceNode: CONFIG.cluster.nodeId,
        interfaceId: this._getInterfaceId(protocol),
      };
    } catch (err) {
      this.logger.error('Receiver', 'Message parse error', { error: err.message, raw: raw.toString('hex').substring(0, 100) });
      return null;
    }
  }

  _getInterfaceId(protocol) {
    const iface = CONFIG.ecu.interfaces.find(i =>
      (protocol === 'TCP' && i.type === 'DoIP') ||
      (protocol === 'UDP' && (i.type === 'CAN' || i.type === 'CAN-FD'))
    );
    return iface ? iface.id : 'unknown';
  }

  _addToBuffer(message) {
    if (!message) return;
    this.messageBuffer.unshift(message);
    if (this.messageBuffer.length > this.maxBufferSize) {
      const dropped = this.messageBuffer.pop();
      this.logger.debug('Receiver', 'Buffer full, dropping oldest message', { id: dropped.id });
    }
  }

  async _handleTCPMessage(socket, data) {
    if (!this.tcpCircuitBreaker.allowRequest()) {
      this.stats.droppedMessages++;
      return;
    }
    const acquired = this.rateLimiter.tryAcquire();
    if (!acquired) {
      this.stats.droppedMessages++;
      this.stats.blockedMessages++;
      this.tcpCircuitBreaker.recordFailure();
      return;
    }
    try {
      this.stats.tcpMessages++;
      this.stats.totalMessages++;
      let message;
      if (this.useThreadPool && this.threadPool) {
        message = await this.threadPool.parseMessage(data, 'TCP', CONFIG.cluster.nodeId);
        if (message) message.raw = Buffer.from(message.rawHex, 'hex');
        this.stats.processedByWorker++;
      } else {
        message = this._parseMessage(data, 'TCP');
      }
      if (message) {
        message.remoteAddress = socket.remoteAddress;
        message.remotePort = socket.remotePort;
        if (this.useTracing) {
          this.traceManager.recordMessageTrace(message, CONFIG.cluster.nodeId, 'receiver_tcp');
          this.stats.tracedMessages++;
        }
        this._addToBuffer(message);
        this.emit('message', message);
        this.logger.info('Receiver', `TCP message received: ${message.sidName} (${message.sid})`, {
          id: message.id,
          did: message.did,
          length: message.length,
          traceId: message.traceId,
        });
        this.stats.forwardedMessages++;
        this.tcpCircuitBreaker.recordSuccess();
      }
    } catch (err) {
      this.stats.errors++;
      this.tcpCircuitBreaker.recordFailure();
      this.logger.error('Receiver', 'TCP message handling error', { error: err.message });
    } finally {
      this.rateLimiter.release();
    }
  }

  async _handleUDPMessage(data, remote) {
    if (!this.udpCircuitBreaker.allowRequest()) {
      this.stats.droppedMessages++;
      return;
    }
    const acquired = this.rateLimiter.tryAcquire();
    if (!acquired) {
      this.stats.droppedMessages++;
      this.stats.blockedMessages++;
      this.udpCircuitBreaker.recordFailure();
      return;
    }
    try {
      this.stats.udpMessages++;
      this.stats.totalMessages++;
      let message;
      if (this.useThreadPool && this.threadPool) {
        message = await this.threadPool.parseMessage(data, 'UDP', CONFIG.cluster.nodeId);
        if (message) message.raw = Buffer.from(message.rawHex, 'hex');
        this.stats.processedByWorker++;
      } else {
        message = this._parseMessage(data, 'UDP');
      }
      if (message) {
        message.remoteAddress = remote.address;
        message.remotePort = remote.port;
        if (this.useTracing) {
          this.traceManager.recordMessageTrace(message, CONFIG.cluster.nodeId, 'receiver_udp');
          this.stats.tracedMessages++;
        }
        this._addToBuffer(message);
        this.emit('message', message);
        this.logger.info('Receiver', `UDP message received: ${message.sidName} (${message.sid})`, {
          id: message.id,
          from: `${remote.address}:${remote.port}`,
          did: message.did,
          traceId: message.traceId,
        });
        this.stats.forwardedMessages++;
        this.udpCircuitBreaker.recordSuccess();
      }
    } catch (err) {
      this.stats.errors++;
      this.udpCircuitBreaker.recordFailure();
      this.logger.error('Receiver', 'UDP message handling error', { error: err.message });
    } finally {
      this.rateLimiter.release();
    }
  }

  _startTCPServer() {
    this.tcpServer = net.createServer(socket => {
      this.logger.info('Receiver', `TCP client connected: ${socket.remoteAddress}:${socket.remotePort}`);
      this.emit('clientConnected', { protocol: 'TCP', address: socket.remoteAddress, port: socket.remotePort });
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 10000);
      socket.on('data', data => {
        this._handleTCPMessage(socket, data);
      });
      socket.on('error', err => {
        this.stats.errors++;
        this.logger.error('Receiver', 'TCP socket error', { error: err.message });
      });
      socket.on('close', () => {
        this.logger.info('Receiver', `TCP client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
        this.emit('clientDisconnected', { protocol: 'TCP', address: socket.remoteAddress });
      });
    });
    this.tcpServer.maxConnections = 50;
    this.tcpServer.listen(CONFIG.ecu.tcpPort, CONFIG.server.host, () => {
      this.logger.info('Receiver', `TCP ECU interface listening on ${CONFIG.server.host}:${CONFIG.ecu.tcpPort}`);
    });
  }

  _startUDPServer() {
    this.udpServer = dgram.createSocket({ type: 'udp4', recvBufferSize: 10 * 1024 * 1024 });
    this.udpServer.on('message', (data, remote) => this._handleUDPMessage(data, remote));
    this.udpServer.on('error', err => {
      this.stats.errors++;
      this.logger.error('Receiver', 'UDP socket error', { error: err.message });
    });
    this.udpServer.on('listening', () => {
      const addr = this.udpServer.address();
      this.logger.info('Receiver', `UDP ECU interface listening on ${addr.address}:${addr.port}`);
    });
    this.udpServer.bind(CONFIG.ecu.udpPort, CONFIG.server.host);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._startTCPServer();
    this._startUDPServer();
    this.logger.info('Receiver', 'ECU Message Receiver started', {
      threadPool: this.useThreadPool,
      rateLimit: this.rateLimiter.maxRequests + '/s',
    });
  }

  stop() {
    this.isRunning = false;
    if (this.tcpServer) this.tcpServer.close();
    if (this.udpServer) this.udpServer.close();
    this.logger.info('Receiver', 'ECU Message Receiver stopped');
  }

  getMessages(limit = 50) {
    return this.messageBuffer.slice(0, limit);
  }

  getStats() {
    return {
      ...this.stats,
      bufferSize: this.messageBuffer.length,
      isRunning: this.isRunning,
      rateLimiter: this.rateLimiter.getStats(),
      tcpCircuitBreaker: this.tcpCircuitBreaker.getState(),
      udpCircuitBreaker: this.udpCircuitBreaker.getState(),
      threadPoolStats: this.threadPool ? this.threadPool.getStats() : null,
      traceStats: this.traceManager ? this.traceManager.getStats() : null,
    };
  }

  clearBuffer() {
    this.messageBuffer = [];
    this.logger.audit('Receiver', 'Message buffer cleared');
  }

  async injectTestMessage(messageData) {
    try {
      const buffer = Buffer.from(messageData, 'hex');
      const message = this._parseMessage(buffer, 'INJECTED');
      if (message) {
        message.sourceNode = 'test';
        this._addToBuffer(message);
        this.emit('message', message);
        return message;
      }
    } catch (e) {
      this.logger.error('Receiver', 'Inject test message failed', { error: e.message });
    }
    return null;
  }
}

module.exports = { ECUMessageReceiver, SID_MAP };
