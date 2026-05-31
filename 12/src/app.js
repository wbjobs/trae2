const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const config = require('./config');
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/device');
const adminRoutes = require('./routes/admin');
const alertRoutes = require('./routes/alerts');
const monitoringRoutes = require('./routes/monitoring');
const metrics = require('./monitoring/metrics');
const clusterMonitor = require('./monitoring/cluster');

const authMiddleware = require('./middleware/auth');
const validation = require('./middleware/validation');
const rateLimiter = require('./middleware/rateLimiter');
const timeoutMiddleware = require('./middleware/timeout');
const queueService = require('./queue');
const alertEngine = require('./alerting/engine');

const createApp = async () => {
  const app = express();

  try {
    await alertEngine.init();
    logger.info('告警引擎已初始化');
  } catch (error) {
    logger.error(`告警引擎初始化失败: ${error.message}`);
  }

  try {
    await clusterMonitor.register();
    clusterMonitor.startHeartbeat();
    logger.info('集群监控已初始化');
  } catch (error) {
    logger.error(`集群监控初始化失败: ${error.message}`);
  }

  alertEngine.onAlert((alert) => {
    metrics.recordAlert(alert.severity);
    clusterMonitor.sendAlertNotification(alert);
  });

  const circuitBreaker = timeoutMiddleware.createCircuitBreaker({
    failureThreshold: 10,
    resetTimeout: 60000,
    halfOpenMaxRequests: 5
  });

  app.use(helmet({
    contentSecurityPolicy: config.nodeEnv === 'production',
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true
    }
  }));

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Device-ID', 'X-Device-Token']
  }));

  app.use(compression());

  app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));

  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(timeoutMiddleware.createRequestTimeout());

  app.use(circuitBreaker.middleware);

  app.use((req, res, next) => {
    const startTime = Date.now();
    req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    metrics.setGauge('http_active_requests', metrics.gauge.http_active_requests + 1);

    logger.info(`请求开始: ${req.method} ${req.path}`, {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      metrics.recordRequest(req.method, req.path, res.statusCode, duration);
      metrics.setGauge('http_active_requests', Math.max(0, metrics.gauge.http_active_requests - 1));

      if (res.statusCode === 429) {
        metrics.recordRateLimited();
      }
    });

    next();
  });

  app.use('/api/auth', rateLimiter.createWindowLimit({
    windowMs: 60000,
    max: 10,
    keyGenerator: (req) => req.ip || 'unknown'
  }));
  app.use('/api/auth', authRoutes);

  app.use('/api/monitoring', authMiddleware.authenticateJWT);
  app.use('/api/monitoring', monitoringRoutes);

  app.use('/api/alerts', authMiddleware.authenticateJWT);

  app.get('/api/alerts/rules', rateLimiter.createWindowLimit({
    windowMs: 60000,
    max: 60,
    keyGenerator: (req) => req.user?.username || req.ip || 'unknown'
  }));
  app.get('/api/alerts/active', validation.validateAlertQuery);
  app.post('/api/alerts/rules', validation.validateAlertRule);
  app.put('/api/alerts/rules/:ruleId', validation.validateAlertRule);
  app.post('/api/alerts/active/:alertId/acknowledge', validation.validateAcknowledge);

  app.use('/api/alerts', alertRoutes);

  app.use('/api/device', authMiddleware.authenticateAPIKey);
  app.use('/api/device', validation.validateDeviceAuth);

  app.use('/api/device', timeoutMiddleware.createGracefulDegrade(queueService));

  app.post('/api/device/report',
    rateLimiter.createDeviceRateLimit(),
    timeoutMiddleware.createReportTimeout(),
    validation.validatePointData,
    validation.validateDataQuality,
    async (req, res, next) => {
      try {
        if (req.validatedData) {
          const alerts = await alertEngine.processData(req.validatedData);
          if (alerts.length > 0) {
            logger.warn(`检测到 ${alerts.length} 条告警`, {
              deviceId: req.validatedData.deviceId,
              requestId: req.requestId
            });
          }
        }
      } catch (error) {
        logger.debug(`告警处理失败: ${error.message}`);
      }
      next();
    }
  );

  app.post('/api/device/report/batch',
    rateLimiter.createBatchRateLimit(),
    timeoutMiddleware.createReportTimeout(),
    validation.validateBatchData
  );

  app.get('/api/device/query',
    rateLimiter.createWindowLimit({
      windowMs: 60000,
      max: 60,
      keyGenerator: (req) => req.headers['x-api-key'] || req.ip || 'unknown'
    }),
    timeoutMiddleware.createQueryTimeout(),
    validation.validateQuery
  );

  app.get('/api/device/latest/:deviceId/:tagId',
    rateLimiter.createWindowLimit({
      windowMs: 60000,
      max: 30,
      keyGenerator: (req) => req.headers['x-api-key'] || req.ip || 'unknown'
    }),
    timeoutMiddleware.createQueryTimeout(),
    validation.validateDeviceId,
    validation.validateTagId
  );

  app.use('/api/device', deviceRoutes);

  app.use('/api/admin', authMiddleware.authenticateJWT);

  app.use('/api/admin', rateLimiter.createWindowLimit({
    windowMs: 60000,
    max: 100,
    keyGenerator: (req) => req.user?.username || req.ip || 'unknown'
  }));

  app.use('/api/admin', adminRoutes);

  app.get('/api/circuit-breaker/status', (req, res) => {
    res.json({
      success: true,
      data: circuitBreaker.getStats()
    });
  });

  app.use((err, req, res, next) => {
    logger.error(`请求错误: ${err.message}`, {
      requestId: req.requestId,
      stack: err.stack
    });

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: '数据验证失败',
        code: 'VALIDATION_ERROR',
        errors: err.details,
        requestId: req.requestId
      });
    }

    res.status(err.status || 500).json({
      success: false,
      message: err.message || '服务器内部错误',
      code: err.code || 'INTERNAL_ERROR',
      requestId: req.requestId
    });
  });

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: '请求的资源不存在',
      code: 'NOT_FOUND',
      path: req.path
    });
  });

  return app;
};

module.exports = createApp;
