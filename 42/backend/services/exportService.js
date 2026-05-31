const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const logger = require('../modules/logger');

class ExportService extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.exportDir = config.export?.dir || './logs/exports';
    this.maxExportSize = config.export?.maxSize || 50 * 1024 * 1024;
    this.supportedFormats = ['json', 'csv', 'xlsx', 'pdf', 'txt'];
    this.exportTasks = new Map();
    this.maxConcurrentExports = config.export?.maxConcurrent || 3;
    this.currentExports = 0;

    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.startCleanupJob();
    logger.info('Export service started');
  }

  async exportEvents(events, options = {}) {
    const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const format = options.format || 'json';
    const filename = options.filename || `events-${exportId}.${format}`;
    const filePath = path.join(this.exportDir, filename);

    if (!this.supportedFormats.includes(format.toLowerCase())) {
      throw new Error(`Unsupported format: ${format}. Supported: ${this.supportedFormats.join(', ')}`);
    }

    const task = {
      id: exportId,
      status: 'pending',
      format,
      filename,
      eventCount: events.length,
      createdAt: Date.now(),
      options
    };

    this.exportTasks.set(exportId, task);

    while (this.currentExports >= this.maxConcurrentExports) {
      await this.sleep(100);
    }

    this.currentExports++;
    task.status = 'processing';

    try {
      let content;
      switch (format.toLowerCase()) {
        case 'csv':
          content = this.toCsv(events, options);
          break;
        case 'xlsx':
          content = await this.toXlsx(events, options);
          break;
        case 'pdf':
          content = this.toPdf(events, options);
          break;
        case 'txt':
          content = this.toTxt(events, options);
          break;
        case 'json':
        default:
          content = this.toJson(events, options);
      }

      if (content && Buffer.byteLength(content) > this.maxExportSize) {
        logger.warn(`Export ${exportId} exceeds max size, using streaming export`);
        await this.streamExport(filePath, events, format, options);
      } else {
        fs.writeFileSync(filePath, content, { encoding: 'utf8' });
      }

      task.status = 'completed';
      task.completedAt = Date.now();
      task.fileSize = fs.statSync(filePath).size;
      task.filePath = filePath;

      this.emit('exportCompleted', {
        exportId,
        filename,
        format,
        eventCount: events.length,
        fileSize: task.fileSize
      });

      return {
        exportId,
        filename,
        filePath,
        format,
        eventCount: events.length,
        downloadUrl: `/api/exports/download/${filename}`
      };
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.failedAt = Date.now();

      this.emit('exportFailed', { exportId, error: error.message });
      throw error;
    } finally {
      this.currentExports--;
    }
  }

  async streamExport(filePath, events, format, options) {
    const writeStream = fs.createWriteStream(filePath, { flags: 'w' });

    return new Promise((resolve, reject) => {
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);

      switch (format.toLowerCase()) {
        case 'csv':
          this.streamCsv(writeStream, events, options);
          break;
        case 'json':
          this.streamJson(writeStream, events, options);
          break;
        case 'txt':
        default:
          this.streamTxt(writeStream, events, options);
      }
    });
  }

  streamCsv(stream, events, options) {
    if (events.length === 0) {
      stream.end();
      return;
    }

    const headers = this.getEventHeaders(events[0]);
    stream.write(headers.join(',') + '\n');

    events.forEach(event => {
      const row = headers.map(h => this.escapeCsvValue(event[h] || '')).join(',');
      stream.write(row + '\n');
    });

    stream.end();
  }

  streamJson(stream, events, options) {
    stream.write('[\n');
    events.forEach((event, index) => {
      const separator = index < events.length - 1 ? ',\n' : '\n';
      stream.write(JSON.stringify(event, null, 2) + separator);
    });
    stream.write(']');
    stream.end();
  }

  streamTxt(stream, events, options) {
    events.forEach(event => {
      stream.write(JSON.stringify(event) + '\n');
    });
    stream.end();
  }

  getEventHeaders(event) {
    return Object.keys(event).filter(key => 
      typeof event[key] !== 'object' || event[key] === null
    );
  }

  escapeCsvValue(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  toJson(events, options = {}) {
    const data = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      totalEvents: events.length,
      events
    };
    return JSON.stringify(data, null, options.pretty ? 2 : 0);
  }

  toCsv(events, options = {}) {
    if (events.length === 0) return '';

    const headers = options.headers || this.getEventHeaders(events[0]);
    const rows = [headers.join(',')];

    events.forEach(event => {
      const row = headers.map(h => this.escapeCsvValue(event[h] ?? '')).join(',');
      rows.push(row);
    });

    return rows.join('\n');
  }

  async toXlsx(events, options = {}) {
    const csvContent = this.toCsv(events, options);
    return Buffer.from(csvContent);
  }

  toPdf(events, options = {}) {
    const txtContent = this.toTxt(events, options);
    return Buffer.from(txtContent);
  }

  toTxt(events, options = {}) {
    return events.map(event => 
      `[${new Date(event.timestamp || Date.now()).toISOString()}] ${event.type || 'EVENT'}: ${JSON.stringify(event)}`
    ).join('\n');
  }

  async exportWithTemplate(events, templatePath, options = {}) {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    const template = fs.readFileSync(templatePath, 'utf8');
    const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const filename = options.filename || `templated-${exportId}.txt`;
    const filePath = path.join(this.exportDir, filename);

    const filledTemplate = template
      .replace(/\{\{totalEvents\}\}/g, events.length)
      .replace(/\{\{exportDate\}\}/g, new Date().toISOString())
      .replace(/\{\{events\}\}/g, events.map(e => JSON.stringify(e)).join('\n'));

    fs.writeFileSync(filePath, filledTemplate);

    return { exportId, filename, filePath };
  }

  async batchExport(exportConfigs) {
    const results = [];
    for (const config of exportConfigs) {
      try {
        const result = await this.exportEvents(config.events, config.options);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  }

  async getExportHistory(filters = {}) {
    const tasks = Array.from(this.exportTasks.values());
    
    return tasks
      .filter(task => {
        if (filters.status && task.status !== filters.status) return false;
        if (filters.format && task.format !== filters.format) return false;
        if (filters.startDate && task.createdAt < filters.startDate) return false;
        if (filters.endDate && task.createdAt > filters.endDate) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getExportTask(exportId) {
    return this.exportTasks.get(exportId) || null;
  }

  async cancelExport(exportId) {
    const task = this.exportTasks.get(exportId);
    if (!task) return false;

    if (task.status === 'pending' || task.status === 'processing') {
      task.status = 'cancelled';
      task.cancelledAt = Date.now();
      return true;
    }
    return false;
  }

  async deleteExport(filename) {
    const filePath = path.join(this.exportDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  async cleanupExports(maxAgeDays = 7) {
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    try {
      const files = fs.readdirSync(this.exportDir);
      files.forEach(file => {
        const filePath = path.join(this.exportDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });

      this.exportTasks.forEach((task, id) => {
        if (task.createdAt < cutoffTime) {
          this.exportTasks.delete(id);
        }
      });

      logger.info(`Cleaned up ${deletedCount} old exports`);
    } catch (error) {
      logger.error('Export cleanup failed:', error);
    }

    return deletedCount;
  }

  startCleanupJob() {
    setInterval(() => {
      this.cleanupExports(config.export?.cleanupDays || 7);
    }, (config.export?.cleanupInterval || 24 * 60 * 60 * 1000));
  }

  getExportStats() {
    const tasks = Array.from(this.exportTasks.values());
    return {
      totalExports: tasks.length,
      completedExports: tasks.filter(t => t.status === 'completed').length,
      failedExports: tasks.filter(t => t.status === 'failed').length,
      pendingExports: tasks.filter(t => t.status === 'pending').length,
      processingExports: tasks.filter(t => t.status === 'processing').length,
      currentConcurrent: this.currentExports,
      maxConcurrent: this.maxConcurrentExports,
      exportDir: this.exportDir
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    this.running = false;
    this.exportTasks.clear();
    logger.info('Export service stopped');
  }
}

const exportService = new ExportService();

if (require.main === module) {
  exportService.start();
}

module.exports = exportService;
