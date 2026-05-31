const EventEmitter = require('events');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const logger = require('../modules/logger');

class RingBuffer {
  constructor(capacity) {
    this.buffer = new Array(capacity);
    this.capacity = capacity;
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  push(item) {
    if (this.size >= this.capacity) {
      this.tail = (this.tail + 1) % this.capacity;
      this.size--;
    }
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.size++;
    return true;
  }

  pop() {
    if (this.size === 0) return null;
    const item = this.buffer[this.tail];
    this.buffer[this.tail] = null;
    this.tail = (this.tail + 1) % this.capacity;
    this.size--;
    return item;
  }

  peek() {
    return this.size > 0 ? this.buffer[this.tail] : null;
  }

  toArray() {
    const result = [];
    let index = this.tail;
    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[index]);
      index = (index + 1) % this.capacity;
    }
    return result;
  }

  clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }
}

class PriorityQueue {
  constructor(maxSize) {
    this.queue = [];
    this.maxSize = maxSize || 2000;
  }

  push(item, priority) {
    const entry = { item, priority, timestamp: Date.now() };
    
    if (this.queue.length >= this.maxSize) {
      const minPriority = Math.min(...this.queue.map(e => e.priority));
      const minIndex = this.queue.findIndex(e => e.priority === minPriority);
      if (priority > minPriority) {
        this.queue.splice(minIndex, 1);
      } else {
        return false;
      }
    }

    this.queue.push(entry);
    this.queue.sort((a, b) => b.priority - a.priority);
    return true;
  }

  pop() {
    return this.queue.shift()?.item;
  }

  peek() {
    return this.queue[0]?.item;
  }

  size() {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
  }

  getAll() {
    return this.queue.map(e => e.item);
  }

  getByPriority(priority) {
    return this.queue.filter(e => e.priority === priority).map(e => e.item);
  }
}

class SignalingService extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.signalingBuffer = new RingBuffer(config.signaling.bufferSize || 10000);
    this.priorityBuffer = new PriorityQueue(config.signaling.priorityBufferSize);
    this.channels = new Map();
    this.packetCount = 0;
    this.droppedPackets = 0;
    this.droppedHighPriority = 0;
    this.simulationInterval = null;
    this.wsServer = null;
    this.httpServer = null;
    this.channelStats = {};
    this.persistenceInterval = null;
    this.lastPersistedIndex = 0;
    this.sequenceTracking = new Map();
    this.lostPackets = new Map();
    this.recoveryBuffer = [];
    this.persistDir = config.signaling.persistenceDir;

    this.batchProcessor = null;
    this.batchInterval = config.signaling.batchInterval || 50;
    this.pendingUpdates = new Map();
    this.lastEmitTime = new Map();
    this.minEmitInterval = config.signaling.minEmitInterval || 100;

    this.adaptiveSampling = config.signaling.adaptiveSampling !== false;
    this.currentSampleRate = config.signaling.sampleRate;
    this.loadMonitorInterval = null;
    this.memoryUsageThreshold = config.signaling.memoryThreshold || 0.8;
    this.cpuUsageThreshold = config.signaling.cpuThreshold || 0.8;

    this.deduplicationCache = new Map();
    this.deduplicationWindow = config.signaling.deduplicationWindow || 1000;
    this.lastCleanupTime = 0;

    if (!fs.existsSync(this.persistDir)) {
      fs.mkdirSync(this.persistDir, { recursive: true });
    }

    this.initializeChannels();
    this.initializeSequenceTracking();
  }

  initializeChannels() {
    config.signaling.protocols.forEach(protocol => {
      config.signaling.frequencyBands.forEach(band => {
        const channelId = `${protocol}-${band}`;
        this.channels.set(channelId, {
          id: channelId,
          protocol,
          frequencyBand: band,
          status: 'inactive',
          snr: 0,
          rssi: -100,
          rsrp: -140,
          rsrq: -20,
          packetLossRate: 0,
          latency: 0,
          jitter: 0,
          bandwidth: 0,
          throughput: 0,
          connectedDevices: 0,
          lastUpdate: Date.now(),
          previousStatus: 'inactive',
          anomalies: [],
          history: [],
          consecutiveLostPackets: 0
        });
      });
    });
  }

  initializeSequenceTracking() {
    config.signaling.protocols.forEach(protocol => {
      config.signaling.frequencyBands.forEach(band => {
        const key = `${protocol}-${band}`;
        this.sequenceTracking.set(key, {
          lastSequence: -1,
          lastReceivedAt: Date.now(),
          lostCount: 0,
          recoveredCount: 0
        });
        this.lostPackets.set(key, []);
      });
    });
  }

  getPacketPriority(packet) {
    if (config.signaling.highPriorityPacketTypes.includes(packet.type)) {
      return 100;
    }
    if (packet.type === 'MEASUREMENT_REPORT') {
      if (packet.snr < 10 || packet.packetLossRate > 2) {
        return 80;
      }
      return 50;
    }
    if (packet.type === 'DATA') {
      return 30;
    }
    if (packet.type === 'VOICE') {
      return 40;
    }
    return 10;
  }

  async start() {
    if (this.running) return;
    this.running = true;

    await this.startWebSocketServer();
    this.startSimulation();
    this.startBatchProcessor();
    
    if (config.signaling.persistenceEnabled) {
      this.startPersistence();
    }

    if (this.adaptiveSampling) {
      this.startLoadMonitor();
    }

    logger.info('Signaling service started with optimized processing pipeline');
  }

  startBatchProcessor() {
    this.batchProcessor = setInterval(() => {
      this.processPendingUpdates();
    }, this.batchInterval);
  }

  processPendingUpdates() {
    const now = Date.now();
    this.pendingUpdates.forEach((update, channelId) => {
      const lastEmit = this.lastEmitTime.get(channelId) || 0;
      if (now - lastEmit >= this.minEmitInterval) {
        this.emit('channelUpdate', update);
        this.lastEmitTime.set(channelId, now);
        this.pendingUpdates.delete(channelId);
      }
    });
  }

  startLoadMonitor() {
    this.loadMonitorInterval = setInterval(() => {
      this.adjustSamplingRate();
      this.cleanupDeduplicationCache();
    }, 5000);
  }

  adjustSamplingRate() {
    const memoryUsage = process.memoryUsage();
    const heapUsedPercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
    
    if (heapUsedPercent > this.memoryUsageThreshold) {
      this.currentSampleRate = Math.min(this.currentSampleRate * 1.5, 2000);
      logger.channel.logChannelMetrics('system', { snr: 0, rssi: 0, packetLossRate: 0 });
      logger.warn(`High memory usage (${(heapUsedPercent * 100).toFixed(1)}%), adjusting sample rate to ${this.currentSampleRate}ms`);
    } else if (heapUsedPercent < 0.5 && this.currentSampleRate > config.signaling.sampleRate) {
      this.currentSampleRate = Math.max(this.currentSampleRate * 0.9, config.signaling.sampleRate);
    }
  }

  cleanupDeduplicationCache() {
    const now = Date.now();
    if (now - this.lastCleanupTime < 30000) return;
    
    this.deduplicationCache.forEach((timestamp, key) => {
      if (now - timestamp > this.deduplicationWindow * 2) {
        this.deduplicationCache.delete(key);
      }
    });
    this.lastCleanupTime = now;
  }

  isDuplicate(data) {
    if (!data.sequence !== undefined) return false;
    
    const key = `${data.protocol}-${data.frequencyBand}-${data.sequence}`;
    const now = Date.now();
    const lastSeen = this.deduplicationCache.get(key);
    
    if (lastSeen && now - lastSeen < this.deduplicationWindow) {
      return true;
    }
    
    this.deduplicationCache.set(key, now);
    return false;
  }

  async startWebSocketServer() {
    this.httpServer = http.createServer();
    this.wsServer = new WebSocket.Server({ server: this.httpServer });

    this.wsServer.on('connection', (ws, req) => {
      const clientId = req.headers['x-client-id'] || 'unknown';
      logger.info(`Signaling client connected: ${clientId}`);

      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      const heartbeatInterval = setInterval(() => {
        if (ws.isAlive === false) {
          logger.warn(`Client ${clientId} heartbeat failed, terminating`);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      }, 30000);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleSignalingData(message, clientId);
        } catch (error) {
          logger.error('Failed to parse signaling data:', error);
        }
      });

      ws.on('close', () => {
        clearInterval(heartbeatInterval);
        logger.info(`Signaling client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        clearInterval(heartbeatInterval);
        logger.error('Signaling WebSocket error:', error);
      });
    });

    await new Promise((resolve) => {
      this.httpServer.listen(config.server.signalingPort, config.server.host, () => {
        logger.info(`Signaling WebSocket server listening on port ${config.server.signalingPort}`);
        resolve();
      });
    });
  }

  handleSignalingData(data, clientId) {
    if (!data || !data.type) return;

    if (this.isDuplicate(data)) {
      this.droppedPackets++;
      return;
    }

    const signalingData = {
      ...data,
      receivedAt: Date.now(),
      source: clientId,
      priority: this.getPacketPriority(data)
    };

    if (config.signaling.highPriorityPacketTypes.includes(data.type)) {
      const success = this.priorityBuffer.push(signalingData, signalingData.priority);
      if (!success) {
        this.droppedHighPriority++;
        logger.warn(`High priority packet dropped: ${data.type} from ${clientId}`);
      }
    }

    this.signalingBuffer.push(signalingData);
    this.packetCount++;

    if (data.type === 'MEASUREMENT_REPORT') {
      this.updateChannelMetrics(data);
      this.trackSequence(data);
    }

    this.emit('signalingData', signalingData);
  }

  trackSequence(packet) {
    if (!config.signaling.lossDetectionEnabled) return;

    const key = `${packet.protocol}-${packet.frequencyBand}`;
    const tracking = this.sequenceTracking.get(key);
    if (!tracking || packet.sequence === undefined) return;

    const expectedSequence = tracking.lastSequence + 1;
    
    if (packet.sequence > expectedSequence && tracking.lastSequence >= 0) {
      const lostCount = packet.sequence - expectedSequence;
      tracking.lostCount += lostCount;
      
      for (let i = expectedSequence; i < packet.sequence; i++) {
        this.lostPackets.get(key).push({
          sequence: i,
          detectedAt: Date.now(),
          channelId: key
        });
      }

      const channel = this.channels.get(key);
      if (channel) {
        channel.consecutiveLostPackets = lostCount;
      }

      if (lostCount >= config.signaling.maxLostPackets) {
        this.emit('packetLossDetected', {
          channelId: key,
          lostCount,
          fromSequence: expectedSequence,
          toSequence: packet.sequence - 1,
          timestamp: Date.now()
        });
      }

      logger.warn(`Sequence gap detected on ${key}: expected ${expectedSequence}, got ${packet.sequence}, lost ${lostCount} packets`);
    }

    if (packet.sequence <= tracking.lastSequence) {
      tracking.recoveredCount++;
      const channel = this.channels.get(key);
      if (channel) {
        channel.consecutiveLostPackets = Math.max(0, channel.consecutiveLostPackets - 1);
      }
    }

    tracking.lastSequence = packet.sequence;
    tracking.lastReceivedAt = Date.now();
  }

  updateChannelMetrics(measurement) {
    const channelId = measurement.channelId || `${measurement.protocol}-${measurement.frequencyBand}`;
    const channel = this.channels.get(channelId);

    if (!channel) return;

    const prevSnr = channel.snr;
    const prevStatus = channel.status;
    
    channel.previousStatus = prevStatus;
    channel.status = 'active';
    channel.snr = measurement.snr ?? channel.snr;
    channel.rssi = measurement.rssi ?? channel.rssi;
    channel.rsrp = measurement.rsrp ?? channel.rsrp;
    channel.rsrq = measurement.rsrq ?? channel.rsrq;
    channel.packetLossRate = measurement.packetLossRate ?? channel.packetLossRate;
    channel.latency = measurement.latency ?? channel.latency;
    channel.jitter = measurement.jitter ?? channel.jitter;
    channel.bandwidth = measurement.bandwidth ?? channel.bandwidth;
    channel.throughput = measurement.throughput ?? channel.throughput;
    channel.connectedDevices = measurement.connectedDevices ?? channel.connectedDevices;
    channel.lastUpdate = Date.now();

    channel.history.push({
      timestamp: Date.now(),
      snr: channel.snr,
      packetLossRate: channel.packetLossRate,
      latency: channel.latency,
      jitter: channel.jitter,
      sequence: measurement.sequence
    });

    if (channel.history.length > 200) {
      channel.history.shift();
    }

    if (prevSnr - channel.snr > config.analysis.anomalyThreshold.snrDrop) {
      channel.anomalies.push({
        type: 'SNR_DROP',
        value: channel.snr,
        previousValue: prevSnr,
        timestamp: Date.now(),
        sequence: measurement.sequence
      });

      if (channel.anomalies.length > 50) {
        channel.anomalies.shift();
      }
    }

    this.pendingUpdates.set(channelId, { ...channel });
  }

  startPersistence() {
    this.persistenceInterval = setInterval(() => {
      if (!this.running) return;
      this.persistData();
    }, config.signaling.persistenceInterval);
  }

  persistData() {
    const dataToPersist = {
      timestamp: Date.now(),
      packetCount: this.packetCount,
      droppedPackets: this.droppedPackets,
      droppedHighPriority: this.droppedHighPriority,
      channels: [],
      sequenceTracking: {}
    };

    this.channels.forEach((channel, channelId) => {
      dataToPersist.channels.push({
        id: channelId,
        status: channel.status,
        snr: channel.snr,
        packetLossRate: channel.packetLossRate,
        latency: channel.latency,
        jitter: channel.jitter,
        lastUpdate: channel.lastUpdate,
        consecutiveLostPackets: channel.consecutiveLostPackets
      });
    });

    this.sequenceTracking.forEach((tracking, key) => {
      dataToPersist.sequenceTracking[key] = {
        lastSequence: tracking.lastSequence,
        lastReceivedAt: tracking.lastReceivedAt,
        lostCount: tracking.lostCount,
        recoveredCount: tracking.recoveredCount
      };
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `signaling-${dateStr}.json`;
    const filePath = path.join(this.persistDir, filename);

    try {
      let existingData = [];
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        existingData = JSON.parse(fileContent);
      }
      existingData.push(dataToPersist);
      
      if (existingData.length > 1000) {
        existingData = existingData.slice(-1000);
      }

      fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
      logger.debug(`Data persisted: ${dataToPersist.packetCount} packets, ${dataToPersist.channels.length} channels`);
    } catch (error) {
      logger.error('Failed to persist signaling data:', error);
    }
  }

  async recoverLostPackets() {
    if (!config.signaling.recoveryEnabled) return;

    const recovered = [];
    this.lostPackets.forEach((packets, channelId) => {
      if (packets.length > 0 && packets.length <= config.signaling.recoveryBatchSize) {
        recovered.push({
          channelId,
          packets: [...packets],
          recoveredAt: Date.now()
        });
        packets.length = 0;
      }
    });

    if (recovered.length > 0) {
      this.recoveryBuffer.push(...recovered);
      if (this.recoveryBuffer.length > 500) {
        this.recoveryBuffer = this.recoveryBuffer.slice(-500);
      }
      logger.info(`Recovered ${recovered.length} channel records`);
    }

    return recovered;
  }

  startSimulation() {
    if (this.simulationInterval) return;

    this.simulationInterval = setInterval(() => {
      if (!this.running) return;

      config.signaling.protocols.forEach((protocol, pIdx) => {
        config.signaling.frequencyBands.forEach((band, bIdx) => {
          if (Math.random() > 0.25) {
            const baseSnr = 35 - pIdx * 5 - bIdx * 2;
            const speed = 80 + Math.random() * 120;
            const isHandover = Math.random() > 0.85;
            const snr = isHandover 
              ? Math.max(-10, baseSnr - 20 + (Math.random() - 0.5) * 10)
              : Math.max(-10, Math.min(50, baseSnr + (Math.random() - 0.5) * 20));
            
            const sequence = this.getNextSequence(protocol, band);

            const measurement = {
              type: 'MEASUREMENT_REPORT',
              timestamp: Date.now(),
              sequence,
              protocol,
              frequencyBand: band,
              channelId: `${protocol}-${band}`,
              snr,
              rssi: -60 + (Math.random() - 0.5) * 40,
              rsrp: -80 + (Math.random() - 0.5) * 40,
              rsrq: -15 + (Math.random() - 0.5) * 10,
              packetLossRate: isHandover ? Math.random() * 5 : Math.random() * 1,
              latency: 30 + Math.random() * 200,
              jitter: 5 + Math.random() * 50,
              bandwidth: 10 + Math.random() * 90,
              throughput: 5 + Math.random() * 50,
              connectedDevices: Math.floor(Math.random() * 10),
              baseStation: `BS-${Math.floor(Math.random() * 20)}`,
              signalQuality: this.getSignalQuality(snr),
              speed,
              isHandoverZone: isHandover
            };

            if (Math.random() > 0.95) {
              measurement.type = 'HANDSHAKE';
            } else if (Math.random() > 0.98) {
              measurement.type = 'KEEPALIVE';
            }

            this.handleSignalingData(measurement, 'simulator');
          }
        });
      });
    }, config.signaling.sampleRate);
  }

  getNextSequence(protocol, band) {
    const key = `${protocol}-${band}`;
    const tracking = this.sequenceTracking.get(key);
    if (tracking) {
      return tracking.lastSequence + 1;
    }
    return 0;
  }

  getSignalQuality(snr) {
    const thresholds = config.analysis.snr;
    if (snr >= thresholds.excellent) return 'excellent';
    if (snr >= thresholds.good) return 'good';
    if (snr >= thresholds.fair) return 'fair';
    return 'poor';
  }

  async getChannelStatus() {
    const channels = [];
    this.channels.forEach((channel) => {
      channels.push({
        ...channel,
        history: channel.history.slice(-20),
        anomalies: channel.anomalies.slice(-10)
      });
    });
    return channels;
  }

  getChannelById(channelId) {
    const channel = this.channels.get(channelId);
    return channel ? { 
      ...channel, 
      history: channel.history.slice(-50),
      anomalies: channel.anomalies.slice(-20)
    } : null;
  }

  getStatistics() {
    let totalActive = 0;
    let avgSnr = 0;
    let avgPacketLoss = 0;
    let worstChannel = null;
    let minSnr = Infinity;
    let totalLost = 0;
    let totalRecovered = 0;

    this.channels.forEach(channel => {
      if (channel.status === 'active') {
        totalActive++;
        avgSnr += channel.snr;
        avgPacketLoss += channel.packetLossRate;
        
        if (channel.snr < minSnr) {
          minSnr = channel.snr;
          worstChannel = channel.id;
        }
      }
    });

    this.sequenceTracking.forEach(tracking => {
      totalLost += tracking.lostCount;
      totalRecovered += tracking.recoveredCount;
    });

    return {
      totalChannels: this.channels.size,
      activeChannels: totalActive,
      inactiveChannels: this.channels.size - totalActive,
      averageSnr: totalActive > 0 ? avgSnr / totalActive : 0,
      averagePacketLoss: totalActive > 0 ? avgPacketLoss / totalActive : 0,
      totalPackets: this.packetCount,
      droppedPackets: this.droppedPackets,
      droppedHighPriority: this.droppedHighPriority,
      bufferSize: this.signalingBuffer.size,
      priorityBufferSize: this.priorityBuffer.size(),
      worstChannel,
      minSnr,
      totalLostPackets: totalLost,
      totalRecoveredPackets: totalRecovered,
      recoveryBufferSize: this.recoveryBuffer.length,
      currentSampleRate: this.currentSampleRate,
      pendingUpdates: this.pendingUpdates.size,
      deduplicationCacheSize: this.deduplicationCache.size,
      memoryUsage: process.memoryUsage(),
      deduplicatedCount: this.droppedPackets
    };
  }

  getLossStatistics() {
    const stats = {
      byChannel: {},
      totalLost: 0,
      totalRecovered: 0,
      recoveryRate: 0
    };

    this.sequenceTracking.forEach((tracking, channelId) => {
      stats.byChannel[channelId] = {
        lost: tracking.lostCount,
        recovered: tracking.recoveredCount,
        lastSequence: tracking.lastSequence
      };
      stats.totalLost += tracking.lostCount;
      stats.totalRecovered += tracking.recoveredCount;
    });

    if (stats.totalLost > 0) {
      stats.recoveryRate = (stats.totalRecovered / stats.totalLost) * 100;
    }

    return stats;
  }

  async stop() {
    this.running = false;

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
      this.persistenceInterval = null;
    }

    if (this.batchProcessor) {
      clearInterval(this.batchProcessor);
      this.batchProcessor = null;
    }

    if (this.loadMonitorInterval) {
      clearInterval(this.loadMonitorInterval);
      this.loadMonitorInterval = null;
    }

    if (this.wsServer) {
      this.wsServer.close();
    }

    if (this.httpServer) {
      this.httpServer.close();
    }

    this.pendingUpdates.clear();
    this.deduplicationCache.clear();

    if (config.signaling.persistenceEnabled) {
      this.persistData();
    }

    logger.info('Signaling service stopped');
  }
}

const signalingService = new SignalingService();

if (require.main === module) {
  signalingService.start();
}

module.exports = signalingService;
