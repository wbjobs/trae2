const config = require('../config');
const logger = require('../utils/logger');

const timeoutMiddleware = {
  createTimeout(timeoutMs = 10000) {
    return (req, res, next) => {
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          logger.warn(`请求超时: ${req.method} ${req.path}, 超时时间: ${timeoutMs}ms`);

          res.status(504).json({
            success: false,
            message: '请求处理超时',
            code: 'REQUEST_TIMEOUT',
            data: {
              timeout: timeoutMs,
              path: req.path,
              method: req.method
            }
          });

          req.isTimedOut = true;
        }
      }, timeoutMs);

      res.on('finish', () => {
        clearTimeout(timeout);
      });

      res.on('close', () => {
        clearTimeout(timeout);
      });

      next();
    };
  },

  createRequestTimeout() {
    return this.createTimeout(10000);
  },

  createReportTimeout() {
    return this.createTimeout(5000);
  },

  createQueryTimeout() {
    return this.createTimeout(15000);
  },

  createGracefulDegrade(queueService) {
    return async (req, res, next) => {
      try {
        const stats = await queueService.getQueueStats();

        if (stats.status === 'critical') {
          const queueDepth = stats.totalPending || 0;

          logger.warn(`服务降级模式: 队列深度=${queueDepth}, 阈值=${config.monitoring.queueDepthThreshold}`);

          res.setHeader('X-Service-Degraded', 'true');
          res.setHeader('X-Queue-Depth', queueDepth);

          if (req.path.includes('/report/batch')) {
            return res.status(503).json({
              success: false,
              message: '服务繁忙，批量上报暂时不可用，请稍后重试或使用单条上报',
              code: 'SERVICE_DEGRADED',
              data: {
                queueDepth,
                threshold: config.monitoring.queueDepthThreshold,
                suggestAction: 'use_single_report'
              }
            });
          }
        }

        next();
      } catch (error) {
        logger.error(`降级检查失败: ${error.message}`);
        next();
      }
    };
  },

  createCircuitBreaker(options = {}) {
    const {
      failureThreshold = 5,
      resetTimeout = 30000,
      halfOpenMaxRequests = 3
    } = options;

    let state = 'closed';
    let failureCount = 0;
    let lastFailureTime = 0;
    let halfOpenRequests = 0;

    const recordSuccess = () => {
      if (state === 'half-open') {
        halfOpenRequests--;
        if (halfOpenRequests <= 0) {
          state = 'closed';
          failureCount = 0;
          logger.info('熔断器状态: closed');
        }
      } else {
        failureCount = 0;
      }
    };

    const recordFailure = () => {
      failureCount++;
      lastFailureTime = Date.now();

      if (failureCount >= failureThreshold && state === 'closed') {
        state = 'open';
        logger.warn(`熔断器状态: open, 失败次数: ${failureCount}`);

        setTimeout(() => {
          state = 'half-open';
          halfOpenRequests = halfOpenMaxRequests;
          logger.info('熔断器状态: half-open');
        }, resetTimeout);
      }
    };

    const isAvailable = () => {
      if (state === 'open') {
        const now = Date.now();
        if (now - lastFailureTime > resetTimeout) {
          state = 'half-open';
          halfOpenRequests = halfOpenMaxRequests;
          logger.info('熔断器状态: half-open');
        }
      }

      return state !== 'open';
    };

    return {
      middleware: (req, res, next) => {
        if (!isAvailable()) {
          return res.status(503).json({
            success: false,
            message: '服务暂时不可用，请稍后重试',
            code: 'CIRCUIT_OPEN'
          });
        }

        res.on('finish', () => {
          if (res.statusCode >= 500) {
            recordFailure();
          } else {
            recordSuccess();
          }
        });

        next();
      },
      getState: () => state,
      getStats: () => ({
        state,
        failureCount,
        failureThreshold,
        lastFailureTime
      })
    };
  }
};

module.exports = timeoutMiddleware;
