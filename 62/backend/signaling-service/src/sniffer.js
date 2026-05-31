/**
 * 信令抓取模块（高性能版）
 *
 * 优化点：
 * 1. 优先级队列 - 关键信令优先处理
 * 2. 重传缓冲区 - ACK超时自动重传
 * 3. 数据库批量插入 - 减少IO开销
 * 4. 自适应捕获间隔 - 根据负载动态调整
 * 5. 系统负载检测 - 过载时自动降级
 * 6. 低优先级采样 - 高频场景下选择性丢弃
 * 7. 内存环形缓冲区 - 防止内存溢出
 * 8. 心跳批量更新 - 减少CPU占用
 * 9. 延迟数据库保存 - 合并多次写入
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const os = require('os');

const commProtocol = require('./protocols/communication');
const accessProtocol = require('./protocols/access');
const broadcastProtocol = require('./protocols/broadcast');
const db = require('./db');

const SIGNAL_TYPES = ['communication', 'access', 'broadcast'];

const PRIORITY = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

const PRIORITY_LABELS = {
  [PRIORITY.CRITICAL]: 'critical',
  [PRIORITY.HIGH]: 'high',
  [PRIORITY.NORMAL]: 'normal',
  [PRIORITY.LOW]: 'low',
};

const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAYS: [1000, 2000, 4000],
  ACK_TIMEOUT: 5000,
};

const BUFFER_CONFIG = {
  MAX_BUFFER_SIZE: 3000,
  FLUSH_INTERVAL: 300,
  BATCH_SIZE: 100,
  DB_BATCH_SIZE: 200,
  DB_FLUSH_INTERVAL: 1000,
};

const PERFORMANCE_CONFIG = {
  BASE_CAPTURE_INTERVAL: 1500,
  MIN_CAPTURE_INTERVAL: 300,
  MAX_CAPTURE_INTERVAL: 3000,
  QUEUE_HIGH_THRESHOLD: 500,
  QUEUE_CRITICAL_THRESHOLD: 1500,
  CPU_HIGH_THRESHOLD: 70,
  CPU_CRITICAL_THRESHOLD: 90,
  MEMORY_HIGH_THRESHOLD: 80,
  LOAD_CHECK_INTERVAL: 5000,
  LOW_PRIORITY_SAMPLE_RATE: 0.3,
  HEARTBEAT_BATCH_SIZE: 50,
};

class RingBuffer {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.buffer = [];
    this.head = 0;
    this.tail = 0;
    this.length = 0;
  }

  push(item) {
    if (this.length >= this.maxSize) {
      this.head = (this.head + 1) % this.maxSize;
      this.length--;
    }
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.maxSize;
    this.length++;
    return true;
  }

  pop() {
    if (this.length === 0) return null;
    const item = this.buffer[this.head];
    this.buffer[this.head] = null;
    this.head = (this.head + 1) % this.maxSize;
    this.length--;
    return item;
  }

  peek() {
    if (this.length === 0) return null;
    return this.buffer[this.head];
  }

  size() {
    return this.length;
  }

  clear() {
    this.buffer = [];
    this.head = 0;
    this.tail = 0;
    this.length = 0;
  }

  toArray() {
    const result = [];
    for (let i = 0; i < this.length; i++) {
      result.push(this.buffer[(this.head + i) % this.maxSize]);
    }
    return result;
  }
}

class PriorityQueue {
  constructor(maxSize = 5000) {
    this.queues = [new RingBuffer(maxSize), new RingBuffer(maxSize), new RingBuffer(maxSize), new RingBuffer(maxSize)];
  }

  enqueue(item, priority) {
    return this.queues[priority].push(item);
  }

  dequeue() {
    for (let i = 0; i < this.queues.length; i++) {
      const item = this.queues[i].pop();
      if (item) return item;
    }
    return null;
  }

  dequeueBatch(count) {
    const batch = [];
    for (let i = 0; i < this.queues.length && batch.length < count; i++) {
      while (batch.length < count) {
        const item = this.queues[i].pop();
        if (!item) break;
        batch.push(item);
      }
    }
    return batch;
  }

  peek() {
    for (let i = 0; i < this.queues.length; i++) {
      const item = this.queues[i].peek();
      if (item) return item;
    }
    return null;
  }

  size() {
    return this.queues.reduce((sum, q) => sum + q.size(), 0);
  }

  clear() {
    this.queues.forEach(q => q.clear());
  }
}

class RetransmissionBuffer {
  constructor() {
    this.pending = new Map();
    this.retries = new Map();
    this.retrySignalIds = new Set();
  }

  add(signalId, signal, priority) {
    if (this.pending.has(signalId)) return false;
    this.pending.set(signalId, {
      signal,
      priority,
      addedAt: Date.now(),
      ackStatus: 'pending',
    });
    this.retries.set(signalId, 0);
    return true;
  }

  markAck(signalId) {
    const entry = this.pending.get(signalId);
    if (entry) {
      entry.ackStatus = 'acked';
      this.pending.delete(signalId);
      this.retries.delete(signalId);
      this.retrySignalIds.delete(signalId);
      return true;
    }
    return false;
  }

  markFailed(signalId, reason) {
    const entry = this.pending.get(signalId);
    if (entry) {
      entry.ackStatus = 'failed';
      entry.failReason = reason;
      this.pending.delete(signalId);
      this.retries.delete(signalId);
      this.retrySignalIds.delete(signalId);
      return true;
    }
    return false;
  }

  getRetryCandidates(limit = 50) {
    const now = Date.now();
    const candidates = [];

    for (const [signalId, entry] of this.pending.entries()) {
      if (candidates.length >= limit) break;
      if (entry.ackStatus !== 'pending') continue;
      if (this.retrySignalIds.has(signalId)) continue;

      const elapsed = now - entry.addedAt;
      const retryCount = this.retries.get(signalId) || 0;

      if (retryCount >= RETRY_CONFIG.MAX_RETRIES) {
        this.markFailed(signalId, 'max_retries_exceeded');
        continue;
      }

      const delay = RETRY_CONFIG.RETRY_DELAYS[retryCount] || RETRY_CONFIG.RETRY_DELAYS[RETRY_CONFIG.RETRY_DELAYS.length - 1];
      if (elapsed >= delay) {
        this.retrySignalIds.add(signalId);
        candidates.push({ signalId, signal: entry.signal, priority: entry.priority, retryCount });
      }
    }

    return candidates;
  }

  clearRetryFlag(signalId) {
    this.retrySignalIds.delete(signalId);
  }

  getStats() {
    let acked = 0;
    let pending = 0;
    let failed = 0;
    for (const entry of this.pending.values()) {
      if (entry.ackStatus === 'acked') acked++;
      else if (entry.ackStatus === 'pending') pending++;
      else if (entry.ackStatus === 'failed') failed++;
    }
    return {
      total: this.pending.size,
      pending,
      acked,
      failed,
      retryQueueSize: this.pending.size,
      inRetry: this.retrySignalIds.size,
    };
  }
}

class SignalSniffer extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.stations = [];
    this.signalInterval = null;
    this.heartbeatInterval = null;
    this.retryInterval = null;
    this.flushInterval = null;
    this.dbFlushInterval = null;
    this.loadMonitorInterval = null;

    this.signalCount = 0;
    this.ackedCount = 0;
    this.retryCount = 0;
    this.droppedCount = 0;
    this.sampledCount = 0;
    this.batchInsertCount = 0;

    this.currentCaptureInterval = PERFORMANCE_CONFIG.BASE_CAPTURE_INTERVAL;
    this.systemLoad = { cpu: 0, memory: 0, queueSize: 0, level: 'normal' };
    this.lastCpuTimes = this._getCpuTimes();

    this.priorityQueue = new PriorityQueue(5000);
    this.retransmissionBuffer = new RetransmissionBuffer();
    this.processingBuffer = [];
    this.dbWriteBuffer = [];
    this.ackCallbacks = new Map();
    this.trainHandoverState = null;

    this.currentStation = null;
    this.handoverInProgress = false;

    this.degradationLevel = 0;
  }

  _getCpuTimes() {
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    for (const cpu of cpus) {
      user += cpu.times.user;
      nice += cpu.times.nice;
      sys += cpu.times.sys;
      idle += cpu.times.idle;
      irq += cpu.times.irq;
    }
    return { user, nice, sys, idle, irq, total: user + nice + sys + idle + irq };
  }

  _getSystemLoad() {
    const now = Date.now();
    const currentTimes = this._getCpuTimes();
    const diffTotal = currentTimes.total - this.lastCpuTimes.total;
    const diffIdle = currentTimes.idle - this.lastCpuTimes.idle;
    const cpuUsage = diffTotal > 0 ? (1 - diffIdle / diffTotal) * 100 : 0;

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;

    const queueSize = this.priorityQueue.size();
    this.lastCpuTimes = currentTimes;

    let level = 'normal';
    if (cpuUsage > PERFORMANCE_CONFIG.CPU_CRITICAL_THRESHOLD ||
        memoryUsage > PERFORMANCE_CONFIG.MEMORY_HIGH_THRESHOLD ||
        queueSize > PERFORMANCE_CONFIG.QUEUE_CRITICAL_THRESHOLD) {
      level = 'critical';
    } else if (cpuUsage > PERFORMANCE_CONFIG.CPU_HIGH_THRESHOLD ||
               queueSize > PERFORMANCE_CONFIG.QUEUE_HIGH_THRESHOLD) {
      level = 'high';
    }

    return {
      cpu: Math.round(cpuUsage * 10) / 10,
      memory: Math.round(memoryUsage * 10) / 10,
      queueSize,
      level,
      timestamp: now,
    };
  }

  _adjustCaptureInterval() {
    const load = this.systemLoad;
    const queueSize = load.queueSize;

    let targetInterval = PERFORMANCE_CONFIG.BASE_CAPTURE_INTERVAL;

    if (load.level === 'critical') {
      targetInterval = PERFORMANCE_CONFIG.MAX_CAPTURE_INTERVAL;
      this.degradationLevel = 3;
    } else if (load.level === 'high') {
      targetInterval = PERFORMANCE_CONFIG.BASE_CAPTURE_INTERVAL * 1.5;
      this.degradationLevel = 2;
    } else if (queueSize > PERFORMANCE_CONFIG.QUEUE_HIGH_THRESHOLD * 0.5) {
      targetInterval = PERFORMANCE_CONFIG.BASE_CAPTURE_INTERVAL * 1.2;
      this.degradationLevel = 1;
    } else if (queueSize < 50) {
      targetInterval = Math.max(PERFORMANCE_CONFIG.MIN_CAPTURE_INTERVAL, PERFORMANCE_CONFIG.BASE_CAPTURE_INTERVAL * 0.8);
      this.degradationLevel = 0;
    } else {
      this.degradationLevel = 0;
    }

    if (targetInterval !== this.currentCaptureInterval && this.signalInterval) {
      clearInterval(this.signalInterval);
      this.currentCaptureInterval = targetInterval;
      this.signalInterval = setInterval(() => this._captureSignal(), this.currentCaptureInterval);
      console.log(`[Sniffer] 自适应调整捕获间隔: ${targetInterval}ms, 降级级别: ${this.degradationLevel}`);
    }
  }

  start() {
    if (this.running) {
      console.log('[Sniffer] 信令抓取服务已在运行中');
      return;
    }

    this.running = true;
    this.stations = db.getAllStations();

    if (this.stations.length > 0) {
      this.currentStation = this.stations[0];
    }

    console.log('[Sniffer] 启动高性能信令抓取: ' + this.stations.length + ' 个车站, 当前车站: ' + (this.currentStation?.name || 'N/A'));

    this.signalInterval = setInterval(() => {
      this._captureSignal();
    }, this.currentCaptureInterval);

    this.heartbeatInterval = setInterval(() => {
      this._updateHeartbeats();
    }, 15000);

    this.retryInterval = setInterval(() => {
      this._processRetries();
    }, 1500);

    this.flushInterval = setInterval(() => {
      this._flushBuffer();
    }, BUFFER_CONFIG.FLUSH_INTERVAL);

    this.dbFlushInterval = setInterval(() => {
      this._flushDbBuffer();
    }, BUFFER_CONFIG.DB_FLUSH_INTERVAL);

    this.loadMonitorInterval = setInterval(() => {
      this.systemLoad = this._getSystemLoad();
      this._adjustCaptureInterval();
      if (this.systemLoad.level !== 'normal') {
        console.log(`[Sniffer] 系统负载: CPU=${this.systemLoad.cpu}%, 内存=${this.systemLoad.memory}%, 队列=${this.systemLoad.queueSize}, 级别=${this.systemLoad.level}`);
      }
    }, PERFORMANCE_CONFIG.LOAD_CHECK_INTERVAL);

    setInterval(() => {
      this._simulateTrainHandover();
    }, 45000);

    this._captureSignal();
    this._updateHeartbeats();
  }

  stop() {
    this.running = false;
    if (this.signalInterval) clearInterval(this.signalInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.retryInterval) clearInterval(this.retryInterval);
    if (this.flushInterval) clearInterval(this.flushInterval);
    if (this.dbFlushInterval) clearInterval(this.dbFlushInterval);
    if (this.loadMonitorInterval) clearInterval(this.loadMonitorInterval);

    this.signalInterval = null;
    this.heartbeatInterval = null;
    this.retryInterval = null;
    this.flushInterval = null;
    this.dbFlushInterval = null;
    this.loadMonitorInterval = null;

    this._flushDbBuffer(true);
    this._flushBuffer();
    db.forceSave();

    this.priorityQueue.clear();
    this.processingBuffer = [];
    this.dbWriteBuffer = [];
    console.log('[Sniffer] 信令抓取服务已停止, 批量插入次数: ' + this.batchInsertCount);
  }

  refreshStations() {
    this.stations = db.getAllStations();
    if (this.stations.length > 0 && !this.currentStation) {
      this.currentStation = this.stations[0];
    }
    console.log('[Sniffer] 车站列表已刷新: ' + this.stations.length + ' 个车站');
  }

  ackSignal(signalId) {
    const removed = this.retransmissionBuffer.markAck(signalId);
    if (removed) {
      this.ackedCount++;
      this.emit('signalAck', { signalId, ackedAt: new Date().toISOString() });
    }
    return removed;
  }

  getAckStatus(signalId) {
    const stats = this.retransmissionBuffer.getStats();
    const entry = this.retransmissionBuffer.pending.get(signalId);
    return {
      signalId,
      exists: !!entry,
      status: entry?.ackStatus || 'unknown',
      retryCount: this.retransmissionBuffer.retries.get(signalId) || 0,
      ...stats,
    };
  }

  _determinePriority(signal) {
    const severity = signal.severity || 'info';
    const protocol = signal.protocol || '';

    if (severity === 'critical' || severity === 'emergency' || protocol === 'SOS') {
      return PRIORITY.CRITICAL;
    }
    if (severity === 'warning' || severity === 'alarm' || signal.type === 'access') {
      return PRIORITY.HIGH;
    }
    if (severity === 'info' || signal.type === 'communication') {
      return PRIORITY.NORMAL;
    }
    return PRIORITY.LOW;
  }

  _captureSignal() {
    if (this.stations.length === 0) return;
    if (this.systemLoad.level === 'critical' && Math.random() < 0.5) return;

    const type = SIGNAL_TYPES[Math.floor(Math.random() * SIGNAL_TYPES.length)];
    let signalData;

    switch (type) {
      case 'communication':
        signalData = commProtocol.generateSignal();
        break;
      case 'access':
        signalData = accessProtocol.generateSignal();
        break;
      case 'broadcast':
        signalData = broadcastProtocol.generateSignal();
        break;
    }

    const useHandover = this.handoverInProgress && Math.random() < 0.3;
    let srcStation, dstStation;

    if (useHandover && this.trainHandoverState) {
      srcStation = this.trainHandoverState.from;
      dstStation = this.trainHandoverState.to;
    } else {
      srcStation = this.currentStation || this.stations[Math.floor(Math.random() * this.stations.length)];
      dstStation = this.stations[Math.floor(Math.random() * this.stations.length)];
    }

    const now = new Date().toISOString();

    const signal = {
      id: uuidv4(),
      type,
      protocol: signalData.protocol,
      src_station: srcStation.id,
      src_station_name: srcStation.name,
      dst_station: dstStation.id,
      dst_station_name: dstStation.name,
      src_device: this._generateDeviceId(type),
      dst_device: this._generateDeviceId(type),
      timestamp: now,
      raw_data: signalData.rawData,
      parsed_data: signalData.parsedData,
      severity: signalData.severity,
      direction: signalData.direction || 'bidirectional',
      priority: null,
      retry_count: 0,
    };

    signal.priority = this._determinePriority(signal);

    if (this.degradationLevel >= 2 && signal.priority >= PRIORITY.LOW) {
      if (Math.random() > PERFORMANCE_CONFIG.LOW_PRIORITY_SAMPLE_RATE) {
        this.sampledCount++;
        return;
      }
    }

    if (this.degradationLevel >= 1 && signal.priority >= PRIORITY.NORMAL) {
      if (Math.random() > 0.7) {
        this.sampledCount++;
        return;
      }
    }

    const enqueued = this.priorityQueue.enqueue(signal, signal.priority);
    if (enqueued) {
      this._processQueue();
    }
  }

  _processQueue() {
    const queueSize = this.priorityQueue.size();
    const batchLimit = Math.min(
      queueSize > 200 ? BUFFER_CONFIG.BATCH_SIZE : 50,
      queueSize
    );

    if (batchLimit === 0) return;

    const signals = this.priorityQueue.dequeueBatch(batchLimit);
    const dbSignals = [];

    for (const signal of signals) {
      this.signalCount++;

      if (signal.priority === PRIORITY.CRITICAL || signal.priority === PRIORITY.HIGH) {
        this.retransmissionBuffer.add(signal.id, signal, signal.priority);
      }

      this.emit('signal', signal);

      const lossRate = this._calculateLossRate();
      if (Math.random() < lossRate && signal.priority !== PRIORITY.CRITICAL) {
        this.droppedCount++;
        signal.dropped = true;
        if (signal.priority === PRIORITY.HIGH) {
          this.retransmissionBuffer.add(signal.id, signal, signal.priority);
        }
        continue;
      }

      if (signal.priority === PRIORITY.CRITICAL) {
        try {
          db.insertSignaling(signal);
        } catch (err) {
          console.error('[Sniffer] 关键信令存储失败:', err.message);
        }
      } else {
        dbSignals.push(signal);
      }

      if (signal.priority === PRIORITY.NORMAL || signal.priority === PRIORITY.LOW) {
        this.processingBuffer.push(signal);
        if (this.processingBuffer.length >= BUFFER_CONFIG.BATCH_SIZE) {
          this._flushBuffer();
        }
      }
    }

    if (dbSignals.length > 0) {
      this.dbWriteBuffer.push(...dbSignals);
      if (this.dbWriteBuffer.length >= BUFFER_CONFIG.DB_BATCH_SIZE) {
        this._flushDbBuffer();
      }
    }
  }

  _flushDbBuffer(force = false) {
    if (this.dbWriteBuffer.length === 0) return;
    if (!force && this.dbWriteBuffer.length < 10) return;

    const batchSize = force ? this.dbWriteBuffer.length : Math.min(BUFFER_CONFIG.DB_BATCH_SIZE, this.dbWriteBuffer.length);
    const batch = this.dbWriteBuffer.splice(0, batchSize);

    try {
      const count = db.batchInsertSignaling(batch);
      this.batchInsertCount++;
    } catch (err) {
      console.error('[Sniffer] 批量存储失败:', err.message);
      for (const signal of batch) {
        try {
          db.insertSignaling(signal);
        } catch (e) {
          console.error('[Sniffer] 回退单个存储失败:', e.message);
        }
      }
    }
  }

  _calculateLossRate() {
    if (this.handoverInProgress) {
      return 0.15;
    }
    const bufferSize = this.priorityQueue.size();
    if (bufferSize > 100) return 0.08;
    if (bufferSize > 50) return 0.03;
    return 0.01;
  }

  _processRetries() {
    const candidates = this.retransmissionBuffer.getRetryCandidates(30);
    if (candidates.length === 0) return;

    const retrySignals = [];
    const retryEvents = [];

    for (const candidate of candidates) {
      const { signalId, signal, retryCount } = candidate;

      this.retryCount++;
      this.retransmissionBuffer.retries.set(signalId, retryCount + 1);

      const retrySignal = {
        ...signal,
        id: signalId + '-retry-' + (retryCount + 1),
        retry_count: retryCount + 1,
        retransmitted: true,
        retry_timestamp: new Date().toISOString(),
        original_id: signalId,
      };

      retrySignals.push(retrySignal);
      retryEvents.push({
        originalId: signalId,
        retrySignal: retrySignal,
        retryCount: retryCount + 1,
      });

      this.retransmissionBuffer.clearRetryFlag(signalId);

      this.emit('signal', retrySignal);
    }

    if (retrySignals.length > 0) {
      try {
        db.batchInsertSignaling(retrySignals);
        this.batchInsertCount++;
      } catch (err) {
        console.error('[Sniffer] 重传批量存储失败:', err.message);
      }

      for (const event of retryEvents) {
        this.emit('signalRetry', event);
      }

      console.log('[Sniffer] 重传处理: ' + candidates.length + ' 条信令, 总重传: ' + this.retryCount);
    }
  }

  _flushBuffer() {
    if (this.processingBuffer.length === 0) return;

    const batch = this.processingBuffer.splice(0, Math.min(BUFFER_CONFIG.BATCH_SIZE, this.processingBuffer.length));
    this.emit('signalBatch', {
      signals: batch,
      count: batch.length,
      timestamp: new Date().toISOString(),
    });
  }

  _simulateTrainHandover() {
    if (this.stations.length < 2) return;

    if (this.handoverInProgress) {
      if (this.trainHandoverState) {
        this.trainHandoverState.phase = 'complete';
        this.currentStation = this.trainHandoverState.to;
        this.emit('trainHandoverComplete', {
          from: this.trainHandoverState.from.name,
          to: this.trainHandoverState.to.name,
          timestamp: new Date().toISOString(),
        });
      }
      this.handoverInProgress = false;
      this.trainHandoverState = null;
      return;
    }

    if (Math.random() < 0.3) {
      const currentIdx = this.stations.findIndex(s => s.id === this.currentStation?.id);
      const nextIdx = (currentIdx + 1 + Math.floor(Math.random() * (this.stations.length - 1))) % this.stations.length;
      const fromStation = this.currentStation || this.stations[0];
      const toStation = this.stations[nextIdx];

      this.handoverInProgress = true;
      this.trainHandoverState = {
        from: fromStation,
        to: toStation,
        phase: 'prepare',
        startedAt: Date.now(),
      };

      this.emit('trainHandoverStart', {
        from: fromStation.name,
        to: toStation.name,
        timestamp: new Date().toISOString(),
      });

      console.log('[Sniffer] 列车切换: ' + fromStation.name + ' → ' + toStation.name);
    }
  }

  _updateHeartbeats() {
    const stationIdsToUpdate = [];
    const linkUpdates = [];

    for (const station of this.stations) {
      const isHandoverSrc = this.trainHandoverState?.from.id === station.id;
      const isHandoverDst = this.trainHandoverState?.to.id === station.id;

      let updateChance = 0.95;
      if (isHandoverSrc) updateChance = 0.7;
      if (isHandoverDst) updateChance = 0.8;

      if (Math.random() < updateChance) {
        stationIdsToUpdate.push(station.id);
      }
    }

    if (stationIdsToUpdate.length > 0) {
      try {
        for (let i = 0; i < stationIdsToUpdate.length; i += PERFORMANCE_CONFIG.HEARTBEAT_BATCH_SIZE) {
          const batch = stationIdsToUpdate.slice(i, i + PERFORMANCE_CONFIG.HEARTBEAT_BATCH_SIZE);
          db.batchUpdateStationHeartbeats(batch);
        }
      } catch (err) {
        console.error('[Sniffer] 批量更新车站心跳失败:', err.message);
        for (const id of stationIdsToUpdate) {
          try { db.updateStationHeartbeat(id); } catch (e) {}
        }
      }
    }

    const links = db.getAllLinks();
    const now = new Date().toISOString();

    for (const link of links) {
      const isHandoverLink = this.trainHandoverState && (
        (link.src_station === this.trainHandoverState.from.id && link.dst_station === this.trainHandoverState.to.id) ||
        (link.src_station === this.trainHandoverState.to.id && link.dst_station === this.trainHandoverState.from.id)
      );

      if (link.status !== 'fault' && Math.random() < 0.9) {
        const baseLatency = isHandoverLink ? 80 : 15;
        const latencies = [
          Math.floor(Math.random() * 20) + baseLatency,
          Math.floor(Math.random() * 15) + baseLatency + 5,
          Math.floor(Math.random() * 50) + baseLatency + 10,
        ];
        const latency = latencies[Math.floor(Math.random() * latencies.length)];
        const packetLoss = isHandoverLink ? Math.random() * 0.05 : Math.random() * 0.01;

        linkUpdates.push({
          id: link.id,
          name: link.name,
          status: 'normal',
          latency,
          packet_loss: packetLoss,
          last_heartbeat: now,
          isHandoverRelated: isHandoverLink,
        });
      } else if (Math.random() < (isHandoverLink ? 0.15 : 0.03)) {
        linkUpdates.push({
          id: link.id,
          name: link.name,
          status: 'degraded',
          latency: Math.floor(Math.random() * 300) + 100,
          packet_loss: Math.random() * 0.15 + 0.01,
          last_heartbeat: now,
          isHandoverRelated: isHandoverLink,
          emitEvent: true,
        });
      }
    }

    if (linkUpdates.length > 0) {
      try {
        const dbUpdates = linkUpdates.map(u => ({
          id: u.id,
          status: u.status,
          latency: u.latency,
          packet_loss: u.packet_loss,
          last_heartbeat: u.last_heartbeat,
        }));

        for (let i = 0; i < dbUpdates.length; i += PERFORMANCE_CONFIG.HEARTBEAT_BATCH_SIZE) {
          const batch = dbUpdates.slice(i, i + PERFORMANCE_CONFIG.HEARTBEAT_BATCH_SIZE);
          db.batchUpdateLinkStatuses(batch);
        }

        for (const update of linkUpdates) {
          if (update.emitEvent) {
            this.emit('linkStatusChange', {
              id: update.id,
              name: update.name,
              status: update.status,
              isHandoverRelated: update.isHandoverRelated,
            });
          }
        }
      } catch (err) {
        console.error('[Sniffer] 批量更新链路状态失败:', err.message);
        for (const update of linkUpdates) {
          try {
            db.updateLinkStatus(update.id, update.status, {
              latency: update.latency,
              packet_loss: update.packet_loss,
              last_heartbeat: update.last_heartbeat,
            });
            if (update.emitEvent) {
              this.emit('linkStatusChange', {
                id: update.id,
                name: update.name,
                status: update.status,
                isHandoverRelated: update.isHandoverRelated,
              });
            }
          } catch (e) {}
        }
      }
    }

    if (stationIdsToUpdate.length > 0 || linkUpdates.length > 0) {
      console.log(`[Sniffer] 心跳更新: 车站=${stationIdsToUpdate.length}, 链路=${linkUpdates.length}`);
    }
  }

  _generateDeviceId(type) {
    const prefixes = {
      communication: ['PABX-', 'IPPHONE-', 'GW-', 'PBX-'],
      access: ['ACS-CTRL-', 'ACS-READER-', 'ACS-DOOR-', 'ACS-CAM-'],
      broadcast: ['PAS-AMP-', 'PAS-ZONE-', 'PAS-MIC-', 'PAS-SPK-'],
    };
    const prefixList = prefixes[type] || ['DEV-'];
    const prefix = prefixList[Math.floor(Math.random() * prefixList.length)];
    return prefix + Math.floor(1000 + Math.random() * 8999);
  }

  getStats() {
    const retryStats = this.retransmissionBuffer.getStats();
    return {
      running: this.running,
      signalCount: this.signalCount,
      ackedCount: this.ackedCount,
      retryCount: this.retryCount,
      droppedCount: this.droppedCount,
      sampledCount: this.sampledCount,
      batchInsertCount: this.batchInsertCount,
      stationCount: this.stations.length,
      currentStation: this.currentStation?.name || null,
      handoverInProgress: this.handoverInProgress,
      queueSize: this.priorityQueue.size(),
      bufferSize: this.processingBuffer.length,
      dbBufferSize: this.dbWriteBuffer.length,
      retryStats,
      systemLoad: this.systemLoad,
      captureInterval: this.currentCaptureInterval,
      degradationLevel: this.degradationLevel,
      priorityLabels: PRIORITY_LABELS,
      performanceConfig: PERFORMANCE_CONFIG,
    };
  }
}

module.exports = SignalSniffer;
module.exports.PRIORITY = PRIORITY;
module.exports.PRIORITY_LABELS = PRIORITY_LABELS;
module.exports.RETRY_CONFIG = RETRY_CONFIG;
module.exports.BUFFER_CONFIG = BUFFER_CONFIG;
