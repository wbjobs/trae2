const logger = require('../utils/logger');
const apiResponse = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  if (err.type === 'entity.parse.failed') {
    return apiResponse.badRequest(res, 'Invalid JSON payload');
  }

  if (err.type === 'entity.too.large') {
    return apiResponse.error(res, 'Payload too large', 413);
  }

  if (err.status === 429) {
    return apiResponse.tooManyRequests(res, 'Rate limit exceeded');
  }

  if (err.name === 'ValidationError') {
    return apiResponse.badRequest(res, err.message, err.details);
  }

  if (err.name === 'UnauthorizedError') {
    return apiResponse.unauthorized(res, err.message);
  }

  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    return apiResponse.error(res, 'Service temporarily unavailable', 503);
  }

  return apiResponse.internalError(res, 'Internal server error');
};

const notFoundHandler = (req, res) => {
  logger.warn('Route not found:', {
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  apiResponse.notFound(res, `Route ${req.method} ${req.path} not found`);
};

module.exports = {
  errorHandler,
  notFoundHandler
};
