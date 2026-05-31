const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const logger = require('../modules/logger');

class PlaybackService extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.playbackSessions = new Map();
    this.recordedData = new Map();
    this.maxRecordedSessions = 100;
    this.maxDataPoints = 10000;
    this.playbackDir = config.playback?.dir || './logs/playback';
    this.compressionEnabled = config.playback?.compression !== false;

    if (!fs.existsSync(this.playbackDir)) {
      fs.mkdirSync(this.playbackDir, { recursive: true });
    }

    this.initializeStorage();
  }

  initializeStorage() {
    try {
      const files = fs.readdirSync(this.playbackDir);
      files.forEach(file => {
        if (file.endsWith('.json') || file.endsWith('.gz')) {
          const sessionId = file.replace(/\.(json|gz)$/, '');
          this.recordedData.set(sessionId, {
            id: sessionId,
            filename: file,
            size: 0,
            recordedAt: fs.statSync(path.join(this.playbackDir, file)).mtime.getTime()
          });
        }
      });
      logger.info(`Playback service initialized with ${this.recordedData.size} stored sessions`);
    } catch (error) {
      logger.error('Failed to initialize playback storage:', error);
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    logger.info('Playback service started');
  }

  async recordSession(channelId, dataPoints, metadata = {}) {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session = {
      id: sessionId,
      channelId,
      startTime: dataPoints[0]?.timestamp || Date.now(),
      endTime: dataPoints[dataPoints.length - 1]?.timestamp || Date.now(),
      dataPointCount: dataPoints.length,
      metadata,
      createdAt: Date.now(),
      data: this.compressData(dataPoints)
    };

    this.playbackSessions.set(sessionId, session);

    if (this.playbackSessions.size > this.maxRecordedSessions) {
      const oldestKey = this.playbackSessions.keys().next().value;
      this.playbackSessions.delete(oldestKey);
    }

    await this.persistSession(session);

    this.emit('sessionRecorded', { sessionId, channelId, dataPointCount: dataPoints.length });

    return sessionId;
  }

  compressData(dataPoints) {
    if (!this.compressionEnabled || dataPoints.length < 100) {
      return dataPoints;
    }

    const compressed = [];
    const step = Math.ceil(dataPoints.length / this.maxDataPoints);

    for (let i = 0; i < dataPoints.length; i += step) {
      const chunk = dataPoints.slice(i, i + step);
      compressed.push({
        timestamp: chunk[0].timestamp,
        endTimestamp: chunk[chunk.length - 1].timestamp,
        avgSnr: chunk.reduce((sum, p) => sum + (p.snr || 0), 0) / chunk.length,
        minSnr: Math.min(...chunk.map(p => p.snr || 0)),
        maxSnr: Math.max(...chunk.map(p => p.snr || 0)),
        avgPacketLoss: chunk.reduce((sum, p) => sum + (p.packetLossRate || 0), 0) / chunk.length,
        maxPacketLoss: Math.max(...chunk.map(p => p.packetLossRate || 0)),
        avgLatency: chunk.reduce((sum, p) => sum + (p.latency || 0), 0) / chunk.length,
        avgJitter: chunk.reduce((sum, p) => sum + (p.jitter || 0), 0) / chunk.length,
        statusChanges: chunk.filter((p, i) => i > 0 && p.status !== chunk[i - 1].status).length,
        anomaliesCount: chunk.filter(p => p.anomalies?.length > 0).length
      });
    }

    return compressed;
  }

  decompressData(compressed) {
    if (!Array.isArray(compressed) || compressed.length === 0) return [];
    if (compressed[0].avgSnr === undefined) return compressed;
    return compressed;
  }

  async persistSession(session) {
    const filePath = path.join(this.playbackDir, `${session.id}.json`);
    try {
      const dataToPersist = {
        ...session,
        data: this.decompressData(session.data)
      };
      fs.writeFileSync(filePath, JSON.stringify(dataToPersist), { encoding: 'utf8' });
      
      const stats = fs.statSync(filePath);
      this.recordedData.set(session.id, {
        id: session.id,
        filename: `${session.id}.json`,
        size: stats.size,
        recordedAt: session.createdAt
      });
    } catch (error) {
      logger.error(`Failed to persist session ${session.id}:`, error);
    }
  }

  async getSession(sessionId) {
    let session = this.playbackSessions.get(sessionId);
    
    if (!session && this.recordedData.has(sessionId)) {
      session = await this.loadSessionFromDisk(sessionId);
    }

    if (!session) return null;

    return {
      ...session,
      data: this.decompressData(session.data)
    };
  }

  async loadSessionFromDisk(sessionId) {
    const filePath = path.join(this.playbackDir, `${sessionId}.json`);
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf8');
      const session = JSON.parse(content);
      this.playbackSessions.set(sessionId, session);
      return session;
    } catch (error) {
      logger.error(`Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  async getAllSessions(filters = {}) {
    const sessions = [];

    this.playbackSessions.forEach(session => {
      if (this.matchFilters(session, filters)) {
        sessions.push({
          id: session.id,
          channelId: session.channelId,
          startTime: session.startTime,
          endTime: session.endTime,
          dataPointCount: session.dataPointCount,
          metadata: session.metadata,
          createdAt: session.createdAt
        });
      }
    });

    this.recordedData.forEach((record, sessionId) => {
      if (!this.playbackSessions.has(sessionId) && this.matchFilters(record, filters)) {
        sessions.push({
          id: record.id,
          filename: record.filename,
          size: record.size,
          recordedAt: record.recordedAt
        });
      }
    });

    return sessions.sort((a, b) => (b.createdAt || b.recordedAt) - (a.createdAt || a.recordedAt));
  }

  matchFilters(session, filters) {
    if (filters.channelId && session.channelId !== filters.channelId) return false;
    if (filters.startTime && (session.startTime || session.recordedAt) < filters.startTime) return false;
    if (filters.endTime && (session.endTime || session.recordedAt) > filters.endTime) return false;
    return true;
  }

  async playSession(sessionId, options = {}) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const dataPoints = this.decompressData(session.data);
    const speed = options.speed || 1;
    const startIndex = options.startIndex || 0;
    const endIndex = options.endIndex || dataPoints.length - 1;

    const playbackData = dataPoints.slice(startIndex, endIndex + 1);

    this.emit('playbackStarted', {
      sessionId,
      channelId: session.channelId,
      dataPointCount: playbackData.length,
      speed,
      startTime: Date.now()
    });

    if (options.realtime) {
      this.playbackInRealtime(sessionId, playbackData, speed);
    }

    return playbackData;
  }

  async playbackInRealtime(sessionId, dataPoints, speed) {
    if (dataPoints.length < 2) return;

    const baseInterval = (dataPoints[1].timestamp - dataPoints[0].timestamp) / speed;
    
    for (let i = 0; i < dataPoints.length; i++) {
      if (!this.running) break;

      this.emit('playbackData', {
        sessionId,
        index: i,
        total: dataPoints.length,
        data: dataPoints[i]
      });

      if (i < dataPoints.length - 1) {
        const nextInterval = Math.max(10, (dataPoints[i + 1].timestamp - dataPoints[i].timestamp) / speed);
        await this.sleep(nextInterval);
      }
    }

    this.emit('playbackCompleted', { sessionId });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stopPlayback(sessionId) {
    this.emit('playbackStopped', { sessionId });
  }

  async recordChannelData(channelId, durationMs = 60000) {
    const channel = this.getChannelData(channelId);
    if (!channel) return null;

    const startTime = Date.now();
    const dataPoints = [];

    const recordInterval = setInterval(() => {
      const currentChannel = this.getChannelData(channelId);
      if (currentChannel) {
        dataPoints.push({
          timestamp: Date.now(),
          snr: currentChannel.snr,
          rssi: currentChannel.rssi,
          rsrp: currentChannel.rsrp,
          rsrq: currentChannel.rsrq,
          packetLossRate: currentChannel.packetLossRate,
          latency: currentChannel.latency,
          jitter: currentChannel.jitter,
          bandwidth: currentChannel.bandwidth,
          throughput: currentChannel.throughput,
          status: currentChannel.status,
          anomalies: currentChannel.anomalies?.slice(-5) || []
        });
      }

      if (Date.now() - startTime >= durationMs) {
        clearInterval(recordInterval);
        this.recordSession(channelId, dataPoints, {
          duration: durationMs,
          reason: 'manual_recording'
        });
      }
    }, 1000);

    return { channelId, recording: true, duration: durationMs, startTime };
  }

  getChannelData(channelId) {
    return null;
  }

  setChannelProvider(provider) {
    this.getChannelData = provider;
  }

  async exportSession(sessionId, format = 'json') {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportToCsv(session);
      case 'json':
      default:
        return JSON.stringify(session, null, 2);
    }
  }

  exportToCsv(session) {
    const dataPoints = this.decompressData(session.data);
    if (dataPoints.length === 0) return '';

    const headers = ['timestamp', 'snr', 'rssi', 'packetLossRate', 'latency', 'jitter', 'status'];
    const rows = [headers.join(',')];

    dataPoints.forEach(point => {
      rows.push([
        point.timestamp,
        point.avgSnr || point.snr || '',
        point.rssi || '',
        point.avgPacketLoss || point.packetLossRate || '',
        point.avgLatency || point.latency || '',
        point.avgJitter || point.jitter || '',
        point.status || ''
      ].join(','));
    });

    return rows.join('\n');
  }

  async deleteSession(sessionId) {
    this.playbackSessions.delete(sessionId);

    const filePath = path.join(this.playbackDir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.recordedData.delete(sessionId);

    this.emit('sessionDeleted', { sessionId });
    return true;
  }

  getStorageStats() {
    let totalSize = 0;
    let fileCount = 0;

    this.recordedData.forEach(record => {
      totalSize += record.size || 0;
      fileCount++;
    });

    return {
      memorySessions: this.playbackSessions.size,
      diskSessions: fileCount,
      totalDiskSize: totalSize,
      totalDiskSizeFormatted: this.formatBytes(totalSize),
      maxSessions: this.maxRecordedSessions
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async cleanupOldSessions(maxAgeDays = 30) {
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    this.recordedData.forEach((record, sessionId) => {
      if (record.recordedAt < cutoffTime) {
        this.deleteSession(sessionId);
        deletedCount++;
      }
    });

    logger.info(`Cleaned up ${deletedCount} old playback sessions`);
    return deletedCount;
  }

  async stop() {
    this.running = false;
    this.playbackSessions.clear();
    logger.info('Playback service stopped');
  }
}

const playbackService = new PlaybackService();

if (require.main === module) {
  playbackService.start();
}

module.exports = playbackService;
