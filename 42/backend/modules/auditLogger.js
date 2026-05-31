const fs = require('fs');
const path = require('path');
const moment = require('moment');
const config = require('../../config/config');
const logger = require('./logger');

const auditLogDir = path.join(config.logging.dir, 'audit');
if (!fs.existsSync(auditLogDir)) {
  fs.mkdirSync(auditLogDir, { recursive: true });
}

const auditLogs = [];
const maxLogs = 10000;

class AuditLogger {
  constructor() {
    this.enabled = config.logging.audit.enabled;
    this.retentionDays = config.logging.audit.retentionDays;
    this.categories = config.logging.audit.categories;
  }

  async log({ category, action, operator, details, level = 'INFO' }) {
    if (!this.enabled) return;

    if (!this.categories.includes(category)) {
      logger.warn(`Invalid audit category: ${category}`);
      return;
    }

    const logEntry = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      category,
      action,
      operator,
      level,
      details: details || {},
      ip: operator?.ip || 'system',
      module: 'RailwayMonitor'
    };

    auditLogs.unshift(logEntry);
    if (auditLogs.length > maxLogs) {
      auditLogs.pop();
    }

    this.writeToFile(logEntry);
  }

  writeToFile(logEntry) {
    const dateStr = moment().format('YYYY-MM-DD');
    const logFile = path.join(auditLogDir, `audit-${dateStr}.log`);
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    fs.appendFile(logFile, logLine, (err) => {
      if (err) {
        logger.error('Failed to write audit log:', err);
      }
    });
  }

  async queryLogs({ page = 1, pageSize = 20, category, action, startDate, endDate, keyword }) {
    let filteredLogs = [...auditLogs];

    if (category) {
      filteredLogs = filteredLogs.filter(log => log.category === category);
    }

    if (action) {
      filteredLogs = filteredLogs.filter(log => log.action === action);
    }

    if (startDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= new Date(startDate));
    }

    if (endDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= new Date(endDate));
    }

    if (keyword) {
      const keywordLower = keyword.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.action.toLowerCase().includes(keywordLower) ||
        log.operator.toLowerCase().includes(keywordLower) ||
        JSON.stringify(log.details).toLowerCase().includes(keywordLower)
      );
    }

    const total = filteredLogs.length;
    const start = (page - 1) * pageSize;
    const records = filteredLogs.slice(start, start + pageSize);

    return {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      records
    };
  }

  async getStatistics() {
    const today = moment().startOf('day');
    const weekAgo = moment().subtract(7, 'days').startOf('day');

    const stats = {
      categoryStats: {},
      actionStats: {},
      todayCount: 0,
      weekCount: 0
    };

    this.categories.forEach(cat => {
      stats.categoryStats[cat] = 0;
    });

    auditLogs.forEach(log => {
      const logDate = moment(log.timestamp);
      
      if (stats.categoryStats[log.category] !== undefined) {
        stats.categoryStats[log.category]++;
      }
      
      if (!stats.actionStats[log.action]) {
        stats.actionStats[log.action] = 0;
      }
      stats.actionStats[log.action]++;

      if (logDate.isSameOrAfter(today)) {
        stats.todayCount++;
      }

      if (logDate.isSameOrAfter(weekAgo)) {
        stats.weekCount++;
      }
    });

    return stats;
  }
}

const auditLogger = new AuditLogger();
module.exports = auditLogger;
