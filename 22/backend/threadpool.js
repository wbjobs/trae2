const { Worker, isMainThread, parentPort, workerData, MessageChannel } = require('worker_threads');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

if (!isMainThread) {
  parentPort.on('message', (task) => {
    try {
      let result;
      switch (task.type) {
        case 'parseMessage':
          result = parseMessageWorker(task.payload);
          break;
        case 'matchRules':
          result = matchRulesWorker(task.payload);
          break;
        case 'serializeData':
          result = serializeDataWorker(task.payload);
          break;
        case 'compressData':
          result = compressDataWorker(task.payload);
          break;
        default:
          result = { error: 'Unknown task type' };
      }
      parentPort.postMessage({ taskId: task.taskId, result });
    } catch (err) {
      parentPort.postMessage({ taskId: task.taskId, error: err.message });
    }
  });

  function parseMessageWorker({ raw, protocol, nodeId }) {
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
    try {
      let buffer;
      if (typeof raw === 'string') {
        buffer = Buffer.from(raw, 'hex');
      } else if (Buffer.isBuffer(raw)) {
        buffer = raw;
      } else if (raw instanceof Uint8Array) {
        buffer = Buffer.from(raw);
      } else if (raw && raw.type === 'Buffer' && Array.isArray(raw.data)) {
        buffer = Buffer.from(raw.data);
      } else {
        return null;
      }
      if (buffer.length < 2) return null;
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
        rawHex: buffer.toString('hex').toUpperCase(),
        sourceNode: nodeId,
      };
    } catch (e) {
      return null;
    }
  }

  function matchRulesWorker({ message, rules }) {
    const result = {
      actions: [],
      finalAction: 'allow',
      matchedRules: [],
      timestamp: new Date().toISOString(),
      rateLimited: false,
    };
    const rateLimitState = {};
    for (const rule of rules) {
      if (!rule.enabled) continue;
      const matched = matchCondition(rule.conditions, message);
      if (matched) {
        result.matchedRules.push({ id: rule.id, name: rule.name, priority: rule.priority, action: rule.action });
        result.actions.push(rule.action);
        if (rule.action === 'block') {
          result.finalAction = 'block';
          break;
        }
        if (rule.action === 'rate_limit' && rule.conditions.rateLimit) {
          const rl = rule.conditions.rateLimit;
          const now = Date.now();
          const state = rateLimitState[rule.id] || { count: 0, windowStart: now };
          if (now - state.windowStart >= rl.windowMs) {
            state.count = 0;
            state.windowStart = now;
          }
          state.count++;
          rateLimitState[rule.id] = state;
          if (state.count > rl.max) {
            result.finalAction = 'block';
            result.rateLimited = true;
            break;
          }
        }
      }
    }
    return result;
  }

  function matchCondition(condition, message) {
    const { sid, sourceNodes, did } = condition;
    if (sid && sid.length > 0) {
      const sidArr = Array.isArray(sid) ? sid : [sid];
      if (!sidArr.includes(message.sid)) return false;
    }
    if (sourceNodes && sourceNodes.length > 0 && !sourceNodes.includes(message.sourceNode)) return false;
    if (did && did.length > 0) {
      const didArr = Array.isArray(did) ? did : [did];
      if (message.did && !didArr.includes(message.did)) return false;
    }
    return true;
  }

  function serializeDataWorker(data) {
    return JSON.stringify(data);
  }

  function compressDataWorker(data) {
    const zlib = require('zlib');
    try {
      const json = typeof data === 'string' ? data : JSON.stringify(data);
      const compressed = zlib.gzipSync(Buffer.from(json));
      return {
        compressed: true,
        data: compressed.toString('base64'),
        originalSize: Buffer.byteLength(json),
        compressedSize: compressed.length,
        ratio: ((1 - compressed.length / Buffer.byteLength(json)) * 100).toFixed(1),
      };
    } catch (e) {
      return { compressed: false, error: e.message };
    }
  }
}

class WorkerSlot {
  constructor(worker) {
    this.worker = worker;
    this.isBusy = false;
    this.currentTask = null;
    this.taskCount = 0;
    this.totalTime = 0;
    this.lastTaskTime = 0;
  }

  get load() {
    return this.taskCount > 0 ? this.totalTime / this.taskCount : 0;
  }
}

class TaskQueue {
  constructor() {
    this.high = [];
    this.normal = [];
    this.low = [];
  }

  push(task, priority = 'normal') {
    const queue = this[priority] || this.normal;
    queue.push(task);
  }

  pop() {
    return this.high.shift() || this.normal.shift() || this.low.shift();
  }

  size() {
    return this.high.length + this.normal.length + this.low.length;
  }

  clear() {
    this.high = [];
    this.normal = [];
    this.low = [];
  }
}

class ThreadPool extends EventEmitter {
  constructor(options = {}) {
    super();
    this.minWorkers = options.minWorkers || 2;
    this.maxWorkers = options.maxWorkers || Math.max(4, os.cpus().length);
    this.workerCount = Math.max(this.minWorkers, options.workerCount || 4);
    this.maxQueueSize = options.maxQueueSize || 5000;
    this.idleTimeout = options.idleTimeout || 30000;
    this.workers = [];
    this.taskQueue = new TaskQueue();
    this.activeTasks = 0;
    this.taskIdCounter = 0;
    this.pendingTasks = new Map();
    this.isShutdown = false;
    this.stats = { submitted: 0, completed: 0, failed: 0, queueDropped: 0, priorityHigh: 0, priorityNormal: 0, priorityLow: 0 };
    this.adaptTimer = null;
    this._initWorkers();
    this._startAdaptiveScaling();
  }

  _initWorkers() {
    for (let i = 0; i < this.workerCount; i++) {
      this._createWorker();
    }
  }

  _createWorker() {
    try {
      const worker = new Worker(__filename, {
        resourceLimits: {
          maxOldGenerationSizeMb: 64,
          maxYoungGenerationSizeMb: 16,
          codeRangeSizeMb: 32,
        },
      });
      const slot = new WorkerSlot(worker);
      worker.on('message', (msg) => this._onWorkerMessage(slot, msg));
      worker.on('error', (err) => this._onWorkerError(slot, err));
      worker.on('exit', () => this._onWorkerExit(slot));
      this.workers.push(slot);
      return slot;
    } catch (e) {
      console.error('Failed to create worker:', e);
      return null;
    }
  }

  _onWorkerMessage(slot, msg) {
    slot.isBusy = false;
    slot.currentTask = null;
    slot.taskCount++;
    if (msg.result?.executionTime) {
      slot.totalTime += msg.result.executionTime;
    }
    slot.lastTaskTime = Date.now();
    this.activeTasks--;
    const pending = this.pendingTasks.get(msg.taskId);
    if (pending) {
      if (msg.error) {
        this.stats.failed++;
        pending.reject(new Error(msg.error));
      } else {
        this.stats.completed++;
        pending.resolve(msg.result);
      }
      this.pendingTasks.delete(msg.taskId);
    }
    this._processQueue();
  }

  _onWorkerError(slot, err) {
    console.error('Worker error:', err);
    if (slot.currentTask) {
      const pending = this.pendingTasks.get(slot.currentTask.taskId);
      if (pending) {
        pending.reject(err);
        this.pendingTasks.delete(slot.currentTask.taskId);
      }
    }
    slot.isBusy = false;
    this.activeTasks--;
  }

  _onWorkerExit(slot) {
    const idx = this.workers.indexOf(slot);
    if (idx !== -1) this.workers.splice(idx, 1);
    if (!this.isShutdown && this.workers.length < this.minWorkers) {
      setTimeout(() => this._createWorker(), 1000);
    }
  }

  _getLeastLoadedWorker() {
    const available = this.workers.filter(w => !w.isBusy);
    if (available.length === 0) return null;
    return available.reduce((min, curr) => curr.load < min.load ? curr : min, available[0]);
  }

  _processQueue() {
    while (this.taskQueue.size() > 0) {
      const worker = this._getLeastLoadedWorker();
      if (!worker) break;
      const task = this.taskQueue.pop();
      if (task) {
        this._executeTask(worker, task);
      }
    }
  }

  _executeTask(slot, task) {
    slot.isBusy = true;
    slot.currentTask = task;
    this.activeTasks++;
    this.pendingTasks.set(task.taskId, task);
    try {
      slot.worker.postMessage(task);
    } catch (e) {
      this.pendingTasks.delete(task.taskId);
      slot.isBusy = false;
      this.activeTasks--;
      task.reject(e);
    }
  }

  _startAdaptiveScaling() {
    this.adaptTimer = setInterval(() => {
      if (this.isShutdown) return;
      const avgLoad = this.workers.reduce((sum, w) => sum + (w.isBusy ? 1 : 0), 0) / this.workers.length;
      const queueSize = this.taskQueue.size();
      if (avgLoad > 0.8 && this.workers.length < this.maxWorkers && queueSize > 100) {
        console.log(`[ThreadPool] Scaling up, load=${avgLoad.toFixed(2)}, queue=${queueSize}`);
        this._createWorker();
      } else if (avgLoad < 0.2 && this.workers.length > this.minWorkers && queueSize === 0) {
        const idleWorkers = this.workers.filter(w => !w.isBusy && Date.now() - w.lastTaskTime > this.idleTimeout);
        if (idleWorkers.length > 0 && this.workers.length - idleWorkers.length >= this.minWorkers) {
          const toRemove = idleWorkers[0];
          console.log(`[ThreadPool] Scaling down, removing idle worker`);
          toRemove.worker.terminate();
          const idx = this.workers.indexOf(toRemove);
          if (idx !== -1) this.workers.splice(idx, 1);
        }
      }
    }, 10000);
  }

  submit(type, payload, priority = 'normal') {
    return new Promise((resolve, reject) => {
      if (this.isShutdown) {
        return reject(new Error('ThreadPool is shutdown'));
      }
      if (this.taskQueue.size() >= this.maxQueueSize && priority !== 'high') {
        this.stats.queueDropped++;
        return reject(new Error('Task queue overflow'));
      }
      const taskId = ++this.taskIdCounter;
      const task = { taskId, type, payload, resolve, reject, priority };
      this.stats.submitted++;
      this.stats[`priority${priority.charAt(0).toUpperCase() + priority.slice(1)}`]++;
      const worker = this._getLeastLoadedWorker();
      if (worker && priority === 'high') {
        this._executeTask(worker, task);
      } else {
        this.taskQueue.push(task, priority);
        if (worker) this._processQueue();
      }
    });
  }

  async parseMessage(raw, protocol, nodeId) {
    return this.submit('parseMessage', { raw, protocol, nodeId }, 'high');
  }

  async matchRules(message, rules) {
    return this.submit('matchRules', { message, rules }, 'normal');
  }

  async serialize(data) {
    return this.submit('serializeData', data, 'low');
  }

  async compress(data) {
    return this.submit('compressData', data, 'low');
  }

  getStats() {
    return {
      workerCount: this.workers.length,
      minWorkers: this.minWorkers,
      maxWorkers: this.maxWorkers,
      activeWorkers: this.workers.filter(w => w.isBusy).length,
      activeTasks: this.activeTasks,
      queueSize: this.taskQueue.size(),
      maxQueueSize: this.maxQueueSize,
      avgLoad: (this.workers.reduce((sum, w) => sum + (w.isBusy ? 1 : 0), 0) / this.workers.length).toFixed(2),
      ...this.stats,
    };
  }

  async shutdown() {
    this.isShutdown = true;
    if (this.adaptTimer) clearInterval(this.adaptTimer);
    this.taskQueue.clear();
    for (const slot of this.workers) {
      try {
        await slot.worker.terminate();
      } catch (e) {}
    }
    this.workers = [];
  }
}

module.exports = { ThreadPool, isMainThread };
