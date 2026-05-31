const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../../../config/config');

const coreLogger = {
  instances: new Map(),
  baseDir: config.logging.dir || './logs',

  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  },

  getBaseFormat() {
    return winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );
  },

  getConsoleFormat() {
    return winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(info => {
        const prefix = info.component ? `[${info.component}]` : '';
        return `${info.timestamp} [${info.level}] ${prefix}: ${info.message}${info.stack ? '\n' + info.stack : ''}`;
      })
    );
  },

  createLogger(options = {}) {
    const name = options.name || 'default';
    const component = options.component || 'SYSTEM';
    const logDir = options.logDir || path.join(this.baseDir, name);

    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    this.ensureDir(logDir);

    const transports = [
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: options.maxFileSize || 5242880,
        maxFiles: options.maxFiles || 5
      }),
      new winston.transports.File({
        filename: path.join(logDir, `${name}.log`),
        level: options.level || 'info',
        maxsize: options.maxFileSize || 10485760,
        maxFiles: options.maxFiles || 10
      })
    ];

    if (options.console !== false) {
      transports.push(new winston.transports.Console({
        format: this.getConsoleFormat()
      }));
    }

    const logger = winston.createLogger({
      level: options.level || config.logging.level || 'info',
      format: this.getBaseFormat(),
      defaultMeta: { component, ...(options.defaultMeta || {}) },
      transports
    });

    logger.stream = {
      write: (message) => {
        logger.info(message.trim());
      }
    };

    this.instances.set(name, logger);
    return logger;
  },

  getLogger(name) {
    return this.instances.get(name) || this.createLogger({ name });
  },

  removeLogger(name) {
    this.instances.delete(name);
  },

  getStats() {
    const stats = {};
    this.instances.forEach((logger, name) => {
      stats[name] = {
        level: logger.level,
        transports: logger.transports.length
      };
    });
    return stats;
  }
};

module.exports = coreLogger;
