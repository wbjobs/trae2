/**
 * 操作日志存储模块（增强版）
 *
 * 功能:
 * - 内存环形缓冲区（最大 10000 条）
 * - 按操作类型/实体/操作员/时间范围过滤
 * - 自动按小时归档到本地文件
 * - 大文件自动拆分（按大小/时间）
 * - 批量导出（支持分页、流式写入）
 * - 归档文件查询与合并
 * - 异常日志专用导出接口
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');

const AuditAction = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  RULE_ADD: 'rule_add',
  RULE_UPDATE: 'rule_update',
  RULE_DELETE: 'rule_delete',
  RULE_TOGGLE: 'rule_toggle',
  NODE_REGISTER: 'node_register',
  NODE_UNREGISTER: 'node_unregister',
  NODE_HEARTBEAT: 'node_heartbeat',
  LINK_RESET: 'link_reset',
  LINK_FAULT: 'link_fault',
  LINK_RECOVER: 'link_recover',
  SYNC_PUSH: 'sync_push',
  SYNC_PULL: 'sync_pull',
  SYNC_BROADCAST: 'sync_broadcast',
  SIGNAL_ACK: 'signal_ack',
  SIGNAL_RETRY: 'signal_retry',
  SIGNAL_LOST: 'signal_lost',
  SYSTEM_INIT: 'system_init',
  SYSTEM_START: 'system_start',
  SYSTEM_STOP: 'system_stop',
  CONFIG_CHANGE: 'config_change',
  ERROR: 'error',
  WARNING: 'warning',
};

const EntityType = {
  SYSTEM: 'system',
  RULE: 'rule',
  NODE: 'node',
  LINK: 'link',
  SIGNAL: 'signal',
  USER: 'user',
  CONFIG: 'config',
};

const MAX_LOG_SIZE = 10000;
const ARCHIVE_INTERVAL = 300000;
const ARCHIVE_DIR = path.join(__dirname, '..', 'data', 'audit-archive');
const MAX_ARCHIVE_FILE_SIZE = 10 * 1024 * 1024;
const BATCH_EXPORT_SIZE = 10000;

const ANOMALY_ACTIONS = [
  'rule_delete',
  'node_unregister',
  'link_fault',
  'signal_lost',
  'error',
  'warning',
  'link_reset',
  'signal_retry',
];

class AuditStore {
  constructor() {
    this.logs = [];
    this.stats = {
      totalRecords: 0,
      byAction: {},
      byEntityType: {},
      byOperator: {},
      anomalyCount: 0,
    };
    this.currentArchiveFile = null;
    this.archiveFileSequence = 0;

    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    this._initCurrentArchiveFile();
    setInterval(() => this._archive(), ARCHIVE_INTERVAL);
  }

  _initCurrentArchiveFile() {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const hourStr = String(now.getHours()).padStart(2, '0');

    const existingFiles = fs.readdirSync(ARCHIVE_DIR)
      .filter(f => f.startsWith(`audit-${dateStr}-${hourStr}`) && f.endsWith('.json'))
      .sort();

    if (existingFiles.length > 0) {
      const lastFile = existingFiles[existingFiles.length - 1];
      const match = lastFile.match(/-(\d+)\.json$/);
      if (match) {
        this.archiveFileSequence = parseInt(match[1], 10) + 1;
      }
      this.currentArchiveFile = path.join(ARCHIVE_DIR, lastFile);
    } else {
      this.archiveFileSequence = 0;
      this.currentArchiveFile = path.join(
        ARCHIVE_DIR,
        `audit-${dateStr}-${hourStr}-${String(this.archiveFileSequence).padStart(3, '0')}.json`
      );
    }
  }

  record(action, entityType, entityId, operator, detail) {
    const entry = {
      id: uuidv4(),
      action,
      entityType,
      entityId,
      operator,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
      timestamp: Date.now(),
      timestampStr: new Date().toISOString(),
    };

    this.logs.push(entry);

    if (this.logs.length > MAX_LOG_SIZE) {
      this.logs.shift();
    }

    this.stats.totalRecords++;
    this.stats.byAction[action] = (this.stats.byAction[action] || 0) + 1;
    this.stats.byEntityType[entityType] = (this.stats.byEntityType[entityType] || 0) + 1;
    this.stats.byOperator[operator] = (this.stats.byOperator[operator] || 0) + 1;

    if (ANOMALY_ACTIONS.includes(action)) {
      this.stats.anomalyCount++;
    }

    this._appendToArchive(entry);

    return entry;
  }

  _appendToArchive(entry) {
    try {
      if (!this.currentArchiveFile) {
        this._initCurrentArchiveFile();
      }

      let existingData = [];
      if (fs.existsSync(this.currentArchiveFile)) {
        const stat = fs.statSync(this.currentArchiveFile);
        if (stat.size > MAX_ARCHIVE_FILE_SIZE) {
          this._rotateArchiveFile();
        } else {
          const content = fs.readFileSync(this.currentArchiveFile, 'utf8');
          try {
            existingData = JSON.parse(content);
          } catch {
            existingData = [];
          }
        }
      }

      existingData.push(entry);
      fs.writeFileSync(this.currentArchiveFile, JSON.stringify(existingData, null, 0));
    } catch (err) {
      console.error('[AuditStore] 追加到归档失败:', err.message);
    }
  }

  _rotateArchiveFile() {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const hourStr = String(now.getHours()).padStart(2, '0');
    this.archiveFileSequence++;

    this.currentArchiveFile = path.join(
      ARCHIVE_DIR,
      `audit-${dateStr}-${hourStr}-${String(this.archiveFileSequence).padStart(3, '0')}.json`
    );

    console.log('[AuditStore] 归档文件已拆分，新文件:', path.basename(this.currentArchiveFile));
  }

  query(options = {}) {
    const {
      action,
      entityType,
      entityId,
      operator,
      startTime,
      endTime,
      keyword,
      isAnomaly,
      limit = 100,
      offset = 0,
    } = options;

    let results = this.logs.slice();

    if (action) results = results.filter(l => l.action === action);
    if (entityType) results = results.filter(l => l.entityType === entityType);
    if (entityId) results = results.filter(l => l.entityId === entityId);
    if (operator) results = results.filter(l => l.operator === operator);
    if (startTime) results = results.filter(l => l.timestamp >= startTime);
    if (endTime) results = results.filter(l => l.timestamp <= endTime);
    if (isAnomaly) results = results.filter(l => ANOMALY_ACTIONS.includes(l.action));
    if (keyword) {
      const kw = keyword.toLowerCase();
      results = results.filter(l =>
        (l.detail || '').toLowerCase().includes(kw) ||
        (l.operator || '').toLowerCase().includes(kw) ||
        (l.action || '').toLowerCase().includes(kw)
      );
    }

    const total = results.length;
    const sliced = results.reverse().slice(offset, offset + limit);

    return {
      total,
      returned: sliced.length,
      offset,
      limit,
      logs: sliced,
    };
  }

  async queryFromArchive(options = {}) {
    const {
      startTime,
      endTime,
      action,
      entityType,
      operator,
      isAnomaly,
      keyword,
    } = options;

    const archiveFiles = this._getArchiveFilesInRange(startTime, endTime);
    const allResults = [];

    for (const file of archiveFiles) {
      try {
        const content = fs.readFileSync(path.join(ARCHIVE_DIR, file), 'utf8');
        const logs = JSON.parse(content);

        let filtered = logs;
        if (startTime) filtered = filtered.filter(l => l.timestamp >= startTime);
        if (endTime) filtered = filtered.filter(l => l.timestamp <= endTime);
        if (action) filtered = filtered.filter(l => l.action === action);
        if (entityType) filtered = filtered.filter(l => l.entityType === entityType);
        if (operator) filtered = filtered.filter(l => l.operator === operator);
        if (isAnomaly) filtered = filtered.filter(l => ANOMALY_ACTIONS.includes(l.action));
        if (keyword) {
          const kw = keyword.toLowerCase();
          filtered = filtered.filter(l =>
            (l.detail || '').toLowerCase().includes(kw) ||
            (l.operator || '').toLowerCase().includes(kw)
          );
        }

        allResults.push(...filtered);
      } catch (err) {
        console.warn('[AuditStore] 读取归档文件失败:', file, err.message);
      }
    }

    return allResults;
  }

  _getArchiveFilesInRange(startTime, endTime) {
    const files = fs.readdirSync(ARCHIVE_DIR)
      .filter(f => f.startsWith('audit-') && f.endsWith('.json'))
      .sort();

    if (!startTime && !endTime) return files;

    return files.filter(file => {
      const match = file.match(/audit-(\d{4})(\d{2})(\d{2})-(\d{2})/);
      if (!match) return false;

      const [, year, month, day, hour] = match;
      const fileTime = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hour, 10)).getTime();

      if (startTime && fileTime + 3600000 < startTime) return false;
      if (endTime && fileTime > endTime) return false;
      return true;
    });
  }

  async batchExport(options = {}, format = 'json', outputPath = null) {
    const memoryResult = this.query({ ...options, limit: MAX_LOG_SIZE, offset: 0 });
    const archiveLogs = await this.queryFromArchive(options);

    const allLogs = [...archiveLogs, ...memoryResult.logs];

    const uniqueLogs = Array.from(new Map(allLogs.map(l => [l.id, l])).values())
      .sort((a, b) => b.timestamp - a.timestamp);

    if (format === 'csv') {
      return this._generateCSV(uniqueLogs, outputPath);
    }

    return this._generateJSON(uniqueLogs, outputPath);
  }

  async exportAnomalyLogs(options = {}, format = 'json', outputPath = null) {
    return this.batchExport({ ...options, isAnomaly: true }, format, outputPath);
  }

  _generateCSV(logs, outputPath) {
    const headers = ['id', 'action', 'entityType', 'entityId', 'operator', 'detail', 'timestamp', 'timestampStr'];
    let csvContent = headers.join(',') + '\n';

    const BATCH_SIZE = 1000;
    for (let i = 0; i < logs.length; i += BATCH_SIZE) {
      const batch = logs.slice(i, i + BATCH_SIZE);
      batch.forEach(log => {
        const row = [
          log.id,
          log.action,
          log.entityType,
          log.entityId || '',
          log.operator,
          '"' + (log.detail || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"',
          log.timestamp,
          log.timestampStr,
        ];
        csvContent += row.join(',') + '\n';
      });
    }

    if (outputPath) {
      fs.writeFileSync(outputPath, csvContent, 'utf8');
      return { filePath: outputPath, recordCount: logs.length };
    }

    return { content: csvContent, recordCount: logs.length };
  }

  _generateJSON(logs, outputPath) {
    const result = {
      exportTime: new Date().toISOString(),
      recordCount: logs.length,
      logs,
      summary: this._generateLogSummary(logs),
    };

    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
      return { filePath: outputPath, recordCount: logs.length };
    }

    return result;
  }

  _generateLogSummary(logs) {
    const byAction = {};
    const byEntityType = {};
    const byOperator = {};
    let anomalyCount = 0;

    logs.forEach(log => {
      byAction[log.action] = (byAction[log.action] || 0) + 1;
      byEntityType[log.entityType] = (byEntityType[log.entityType] || 0) + 1;
      byOperator[log.operator] = (byOperator[log.operator] || 0) + 1;
      if (ANOMALY_ACTIONS.includes(log.action)) anomalyCount++;
    });

    return {
      totalRecords: logs.length,
      anomalyCount,
      byAction,
      byEntityType,
      byOperator,
      timeRange: logs.length > 0 ? {
        start: logs[logs.length - 1].timestampStr,
        end: logs[0].timestampStr,
      } : null,
    };
  }

  getStats() {
    return {
      ...this.stats,
      bufferSize: this.logs.length,
      maxBufferSize: MAX_LOG_SIZE,
      archivedFiles: this._listArchiveFiles(),
      anomalyActions: ANOMALY_ACTIONS,
    };
  }

  export(options = {}, format = 'json') {
    const result = this.query({ ...options, limit: MAX_LOG_SIZE, offset: 0 });

    if (format === 'csv') {
      const headers = ['id', 'action', 'entityType', 'entityId', 'operator', 'detail', 'timestamp'];
      const lines = [headers.join(',')];
      result.logs.forEach(log => {
        const row = [
          log.id,
          log.action,
          log.entityType,
          log.entityId || '',
          log.operator,
          '"' + (log.detail || '').replace(/"/g, '""') + '"',
          log.timestampStr,
        ];
        lines.push(row.join(','));
      });
      return lines.join('\n');
    }

    return JSON.stringify(result.logs, null, 2);
  }

  getById(id) {
    return this.logs.find(l => l.id === id) || null;
  }

  _archive() {
    if (this.logs.length < 100) return;

    this._initCurrentArchiveFile();
    console.log('[AuditStore] 执行定期归档检查，缓冲区:', this.logs.length, '条');
  }

  _listArchiveFiles() {
    try {
      if (!fs.existsSync(ARCHIVE_DIR)) return [];
      return fs.readdirSync(ARCHIVE_DIR)
        .filter(f => f.startsWith('audit-') && f.endsWith('.json'))
        .map(f => {
          const stat = fs.statSync(path.join(ARCHIVE_DIR, f));
          return {
            filename: f,
            size: stat.size,
            sizeMB: (stat.size / 1024 / 1024).toFixed(2),
            modified: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.filename.localeCompare(a.filename));
    } catch (err) {
      return [];
    }
  }

  getArchivedFiles() {
    return this._listArchiveFiles();
  }

  mergeArchiveFiles(fileNames, outputPath) {
    const allLogs = [];

    for (const fileName of fileNames) {
      try {
        const filePath = path.join(ARCHIVE_DIR, fileName);
        const content = fs.readFileSync(filePath, 'utf8');
        const logs = JSON.parse(content);
        allLogs.push(...logs);
      } catch (err) {
        console.warn('[AuditStore] 合并文件失败:', fileName, err.message);
      }
    }

    const uniqueLogs = Array.from(new Map(allLogs.map(l => [l.id, l])).values())
      .sort((a, b) => a.timestamp - b.timestamp);

    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(uniqueLogs, null, 2));
      return { filePath: outputPath, recordCount: uniqueLogs.length };
    }

    return uniqueLogs;
  }

  cleanupOldArchiveFiles(maxAgeDays = 30) {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const files = this._listArchiveFiles();
    const deleted = [];

    files.forEach(file => {
      const fileTime = new Date(file.modified).getTime();
      if (fileTime < cutoff) {
        try {
          fs.unlinkSync(path.join(ARCHIVE_DIR, file.filename));
          deleted.push(file.filename);
        } catch (err) {
          console.warn('[AuditStore] 删除旧文件失败:', file.filename, err.message);
        }
      }
    });

    return { deletedCount: deleted.length, deletedFiles: deleted };
  }

  async streamExport(options, format, writeStream) {
    const allLogs = await this.queryFromArchive(options);
    const memoryResult = this.query({ ...options, limit: MAX_LOG_SIZE, offset: 0 });

    const uniqueLogs = Array.from(new Map([...allLogs, ...memoryResult.logs].map(l => [l.id, l])).values())
      .sort((a, b) => b.timestamp - a.timestamp);

    if (format === 'csv') {
      const headers = ['id', 'action', 'entityType', 'entityId', 'operator', 'detail', 'timestamp', 'timestampStr'];
      writeStream.write(headers.join(',') + '\n');

      for (const log of uniqueLogs) {
        const row = [
          log.id,
          log.action,
          log.entityType,
          log.entityId || '',
          log.operator,
          '"' + (log.detail || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"',
          log.timestamp,
          log.timestampStr,
        ];
        writeStream.write(row.join(',') + '\n');
      }
    } else {
      writeStream.write('{"exportTime":"' + new Date().toISOString() + '","recordCount":' + uniqueLogs.length + ',"logs":[');

      for (let i = 0; i < uniqueLogs.length; i++) {
        if (i > 0) writeStream.write(',');
        writeStream.write(JSON.stringify(uniqueLogs[i]));
      }

      writeStream.write(']}');
    }

    writeStream.end();
    return uniqueLogs.length;
  }
}

const auditStore = new AuditStore();

module.exports = {
  AuditAction,
  EntityType,
  ANOMALY_ACTIONS,
  auditStore,
};
