const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { config } = require('./config');
const logger = require('./utils/logger');
const tokenBucketRateLimiter = require('./middleware/tokenBucketRateLimiter');

const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health.routes');
const corrosionRoutes = require('./routes/corrosion.routes');
const alertRoutes = require('./routes/alert.routes');
const deviceMonitorRoutes = require('./routes/deviceMonitor.routes');

const app = express();

tokenBucketRateLimiter.init();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Device-ID']
}));

app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.use(express.json({
  limit: '50mb',
  strict: true,
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        success: false,
        message: 'Invalid JSON payload'
      });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(tokenBucketRateLimiter.middleware());

app.use(requestLogger);

app.use((req, res, next) => {
  res.setHeader('X-Request-ID', req.headers['x-request-id'] || require('uuid').v4());
  res.setHeader('X-Service', 'pipeline-corrosion-monitor');
  next();
});

app.use('/api/v1', healthRoutes);
app.use('/api/v1/corrosion', corrosionRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/monitor', deviceMonitorRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'Pipeline Corrosion Monitoring API',
    version: '1.0.0',
    description: '长输管线腐蚀监测数据接入与分级告警API',
    endpoints: {
      health: '/api/v1/health',
      corrosionData: '/api/v1/corrosion/data',
      alerts: '/api/v1/alerts',
      docs: '/api/v1/docs'
    }
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
