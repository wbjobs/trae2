const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { CONFIG } = require('./config');

class Logger {
  constructor() {
    this.logDir = CONFIG.logger.logDir;
    this.maxFileSize = CONFIG.logger.maxFileSize;
    this.maxFiles = CONFIG.logger.maxFiles;
    this.levels = CONFIG.logger.levels;
    this.defaultLevel = CONFIG.logger.defaultLevel;
    this.auditLog = [];
    this.auditMaxSize = 5000;
    this.moduleStreams = {};
    this._ensureLogDir();
    this._initStreams();
    this._startLogMaintenance();
  }

  _ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    const archiveDir = path.join(this.logDir, 'archive');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
  }

  _getLogFile(level, module = 'general') {
    const date = new Date().toISOString().split('T')[0];
    const moduleDir = path.join(this.logDir, module);
    if (!fs.existsSync(moduleDir)) {
      fs.mkdirSync(moduleDir, { recursive: true });
    }
    return path.join(moduleDir, `${level}-${date}.log`);
  }

  _rotateIfNeeded(filePath, level, module) {
    if (!fs.existsSync(filePath)) return;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > this.maxFileSize) {
        const ext = path.extname(filePath);
        const base = path.basename(filePath, ext);
        const dir = path.dirname(filePath);
        for (let i = this.maxFiles - 1; i > 0; i--) {
          const oldFile = path.join(dir, `${base}-${i}${ext}`);
          const newFile = path.join(dir, `${base}-${i + 1}${ext}`);
          if (fs.existsSync(oldFile)) {
            if (i === this.maxFiles - 1) {
              this._archiveFile(oldFile);
            } else {
              fs.renameSync(oldFile, newFile);
            }
          }
        }
        fs.renameSync(filePath, path.join(dir, `${base}-1${ext}`));
      }
    } catch (e) {
      console.error('Log rotation error:', e);
    }
  }

  _archiveFile(filePath) {
    try {
      const content = fs.readFileSync(filePath);
      const compressed = zlib.gzipSync(content);
      const archiveDir = path.join(this.logDir, 'archive');
      const archiveName = path.basename(filePath) + '.gz';
      fs.writeFileSync(path.join(archiveDir, archiveName), compressed);
      fs.unlinkSync(filePath);
      this._cleanupOldArchives();
    } catch (e) {
      console.error('Archive error:', e);
    }
  }

  _cleanupOldArchives() {
    try {
      const archiveDir = path.join(this.logDir, 'archive');
      const files = fs.readdirSync(archiveDir).map(f => ({
        name: f,
        path: path.join(archiveDir, f),
        time: fs.statSync(path.join(archiveDir, f)).mtime,
      }));
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      files.forEach(f => {
        if (f.time < cutoffDate) {
          fs.unlinkSync(f.path);
        }
      });
    } catch (e) {}
  }

  _initStreams() {
    this.streams = {};
    for (const level of this.levels) {
      this.streams[level] = {};
    }
  }

  _getStream(level, module = 'general') {
    if (!this.streams[level][module]) {
      const file = this._getLogFile(level, module);
      this._rotateIfNeeded(file, level, module);
      this.streams[level][module] = fs.createWriteStream(file, { flags: 'a' });
    }
    return this.streams[level][module];
  }

  _formatMessage(level, module, message, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      nodeId: CONFIG.cluster.nodeId,
      pid: process.pid,
      ...(data && typeof data === 'object' ? { data } : {}),
    };
    return JSON.stringify(entry);
  }

  _write(level, module, message, data) {
    try {
      const formatted = this._formatMessage(level, module, message, data);
      const stream = this._getStream(level, module);
      if (stream) {
        stream.write(formatted + '\n');
      }
      const generalStream = this._getStream(level, 'general');
      if (generalStream && module !== 'general') {
        generalStream.write(formatted + '\n');
      }
      if (level === 'audit') {
        this.auditLog.unshift(JSON.parse(formatted));
        if (this.auditLog.length > this.auditMaxSize) {
          this.auditLog.pop();
        }
      }
      if (level === 'error' || level === 'warn') {
        console[level === 'error' ? 'error' : 'warn'](`[${module}] ${message}`, data || '');
      }
    } catch (e) {
      console.error('Log write error:', e);
    }
  }

  _startLogMaintenance() {
    setInterval(() => {
      this._cleanupOldArchives();
      Object.keys(this.streams).forEach(level => {
        Object.keys(this.streams[level]).forEach(module => {
          const stream = this.streams[level][module];
          if (stream && stream.writableLength > this.maxFileSize) {
            stream.end();
            delete this.streams[level][module];
          }
        });
      });
    }, 60000);
  }

  error(module, message, data) { this._write('error', module, message, data); }
  warn(module, message, data) { this._write('warn', module, message, data); }
  info(module, message, data) { this._write('info', module, message, data); }
  debug(module, message, data) { this._write('debug', module, message, data); }
  audit(module, message, data) { this._write('audit', module, message, data); }

  getAuditLogs(filter = {}) {
    let logs = [...this.auditLog];
    if (filter.module) {
      logs = logs.filter(l => l.module === filter.module);
    }
    if (filter.limit) {
      logs = logs.slice(0, filter.limit);
    }
    return logs;
  }

  queryLogs(level, limit = 100, module = 'general') {
    const file = this._getLogFile(level, module);
    if (!fs.existsSync(file)) return [];
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n').filter(Boolean).slice(-limit);
      return lines.map(line => {
        try { return JSON.parse(line); } catch { return { raw: line }; }
      });
    } catch (e) {
      return [];
    }
  }

  queryAllLogs(limit = 100) {
    const results = {};
    for (const level of this.levels) {
      results[level] = this.queryLogs(level, limit);
    }
    return results;
  }

  getLogStats() {
    try {
      const stats = {
        totalSize: 0,
        fileCount: 0,
        modules: {},
      };
      const modules = fs.readdirSync(this.logDir).filter(f =>
        fs.statSync(path.join(this.logDir, f)).isDirectory()
      );
      for (const mod of modules) {
        const modPath = path.join(this.logDir, mod);
        const files = fs.readdirSync(modPath).filter(f => f.endsWith('.log'));
        stats.modules[mod] = {
          fileCount: files.length,
          totalSize: files.reduce((sum, f) => sum + fs.statSync(path.join(modPath, f)).size, 0),
        };
        stats.fileCount += files.length;
        stats.totalSize += stats.modules[mod].totalSize;
      }
      const archiveDir = path.join(this.logDir, 'archive');
      if (fs.existsSync(archiveDir)) {
        const archives = fs.readdirSync(archiveDir);
        stats.archives = {
          count: archives.length,
          totalSize: archives.reduce((sum, f) => {
            try { return sum + fs.statSync(path.join(archiveDir, f)).size; } catch { return sum; }
          }, 0),
        };
      }
      return stats;
    } catch (e) {
      return { error: e.message };
    }
  }

  close() {
    for (const level in this.streams) {
      for (const module in this.streams[level]) {
        try { this.streams[level][module].end(); } catch (e) {}
      }
    }
  }
}

module.exports = Logger;
