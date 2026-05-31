const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  logger.info('Incoming request:', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.headers['x-request-id']
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed:', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });

  next();
};

module.exports = requestLogger;
