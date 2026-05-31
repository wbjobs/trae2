const fs = require('fs');
const readline = require('readline');
const { EventEmitter } = require('events');

const BATCH_SIZE = 5000;
const LOG_PARSE_REGEX = /^\[?([\-\dT:.Z]+)\]?\s*(INFO|WARN|ERROR|DEBUG)\s*\[(\w+)\]\s*(.*)$/i;

const ANOMALY_RULES = [
  { id: 'error_level', type: 'level', value: 'error', label: '错误级别' },
  { id: 'fatal_keyword', type: 'keyword', value: 'fatal', label: '致命错误' },
  { id: 'exception_keyword', type: 'keyword', value: 'exception', label: '异常' },
  { id: 'timeout_keyword', type: 'keyword', value: 'timeout', label: '超时' },
  { id: 'failed_keyword', type: 'keyword', value: 'failed', label: '失败' },
  { id: 'stacktrace', type: 'keyword', value: 'at ', label: '堆栈跟踪' },
  { id: 'null_pointer', type: 'keyword', value: 'null', label: '空指针' },
  { id: 'oom', type: 'keyword', value: 'out of memory', label: '内存溢出' }
];

class Logger extends EventEmitter {
  constructor() {
    super();
    this.logs = [];
    this.watchers = new Map();
    this.fileOffsets = new Map();
    this.timer = null;
    this.maxLogs = 10000;
    this.sampleIndex = 0;
    this._batchMode = false;
    this._anomalyCache = new Set();
  }

  start() {
    this.timer = setInterval(() => {
      this.appendSample();
    }, 2000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.watchers.forEach((watcher, _) => watcher.close());
    this.watchers.clear();
  }

  _detectAnomaly(entry) {
    const anomalies = [];
    for (const rule of ANOMALY_RULES) {
      if (rule.type === 'level' && entry.level === rule.value) {
        anomalies.push(rule.label);
      } else if (rule.type === 'keyword') {
        if (entry.message.toLowerCase().includes(rule.value.toLowerCase())) {
          anomalies.push(rule.label);
        }
      }
    }
    return anomalies.length > 0 ? anomalies : null;
  }

  appendSample() {
    const levels = ['info', 'warn', 'error', 'debug'];
    const modules = ['auth', 'database', 'api', 'renderer', 'network', 'storage'];
    const messages = {
      info: ['用户登录成功', '数据库连接正常', '接口响应 200 OK', '页面渲染完成'],
      warn: ['请求响应较慢', '缓存即将失效', '连接数超过阈值'],
      error: ['数据库连接失败', '接口超时', '未捕获的异常: NullPointerException at com.example.App'],
      debug: ['参数校验通过', '执行步骤 1/3', '数据格式正确']
    };
    const level = levels[Math.floor(Math.random() * levels.length)];
    const module = modules[Math.floor(Math.random() * modules.length)];
    const msgList = messages[level];
    const message = msgList[Math.floor(Math.random() * msgList.length)];

    const entry = {
      id: ++this.sampleIndex,
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      source: 'sample'
    };
    entry.anomalies = this._detectAnomaly(entry);
    this._push(entry);
  }

  parseLine(rawLine, source) {
    const line = rawLine.trim();
    if (!line) return null;
    let entry = null;
    try {
      const obj = JSON.parse(line);
      entry = {
        id: ++this.sampleIndex,
        timestamp: obj.timestamp || new Date().toISOString(),
        level: obj.level || 'info',
        module: obj.module || 'unknown',
        message: obj.message || line,
        source: source || 'file'
      };
    } catch (_) {
      const match = line.match(LOG_PARSE_REGEX);
      if (match) {
        entry = {
          id: ++this.sampleIndex,
          timestamp: match[1],
          level: match[2].toLowerCase(),
          module: match[3],
          message: match[4],
          source: source || 'file'
        };
      } else {
        entry = {
          id: ++this.sampleIndex,
          timestamp: new Date().toISOString(),
          level: 'info',
          module: 'unknown',
          message: line,
          source: source || 'file'
        };
      }
    }
    entry.anomalies = this._detectAnomaly(entry);
    return entry;
  }

  async ingestFile(filePath, incremental = false) {
    this._batchMode = true;
    let count = 0;
    try {
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      const startOffset = incremental ? (this.fileOffsets.get(filePath) || 0) : 0;

      if (incremental && startOffset >= fileSize) {
        this._batchMode = false;
        return { count: 0, path: filePath, incremental: true };
      }

      const rl = readline.createInterface({
        input: fs.createReadStream(filePath, {
          encoding: 'utf8',
          highWaterMark: 256 * 1024,
          start: startOffset
        }),
        crlfDelay: Infinity
      });

      let lineBuffer = [];
      let bytesRead = startOffset;

      for await (const line of rl) {
        bytesRead += Buffer.byteLength(line, 'utf8') + 1;
        lineBuffer.push(line);
        if (lineBuffer.length >= BATCH_SIZE) {
          this._processLines(lineBuffer, filePath);
          count += lineBuffer.length;
          lineBuffer = [];
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      if (lineBuffer.length > 0) {
        this._processLines(lineBuffer, filePath);
        count += lineBuffer.length;
      }

      rl.close();
      this.fileOffsets.set(filePath, fileSize);
    } catch (err) {
      this._batchMode = false;
      throw err;
    }

    this._batchMode = false;
    if (count > 0) {
      this.emit('logs:imported', { count, path: filePath, incremental });
    }
    return { count, path: filePath, incremental };
  }

  _processLines(lines, filePath) {
    const batch = [];
    for (const line of lines) {
      const entry = this.parseLine(line, filePath);
      if (entry) {
        this.logs.push(entry);
        batch.push(entry);
      }
    }
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }
    if (!this._batchMode && batch.length > 0) {
      this.emit('logs:batch', batch);
    }
  }

  watchFile(filePath) {
    if (this.watchers.has(filePath)) {
      return false;
    }

    this.ingestFile(filePath, false).catch(err => console.error('initial watch read error', err));

    const watcher = fs.watch(filePath, { persistent: true }, (event) => {
      if (event === 'change') {
        this.ingestFile(filePath, true).catch(err => console.error('watch read error', err));
      }
    });

    watcher.on('error', (err) => {
      console.error('watcher error:', err);
      this.watchers.delete(filePath);
    });

    this.watchers.set(filePath, watcher);
    this.emit('watch:started', { path: filePath });
    return true;
  }

  unwatchFile(filePath) {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
      this.fileOffsets.delete(filePath);
      this.emit('watch:stopped', { path: filePath });
      return true;
    }
    return false;
  }

  getWatchedFiles() {
    return Array.from(this.watchers.keys());
  }

  _push(entry) {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }
    if (!this._batchMode) {
      this.emit('log', entry);
    }
  }

  getLogs() {
    return this.logs.slice();
  }

  clear() {
    this.logs = [];
    this.sampleIndex = 0;
    this.emit('cleared');
  }
}

module.exports = new Logger();
