const { v4: uuidv4 } = require('uuid');

class ApiResponse {
  constructor() {
    this.requestId = uuidv4();
  }

  success(res, data = null, message = 'success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      message,
      data
    });
  }

  error(res, message = 'error', statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      message,
      errors
    });
  }

  created(res, data = null, message = 'created successfully') {
    return this.success(res, data, message, 201);
  }

  noContent(res) {
    return res.status(204).send();
  }

  badRequest(res, message = 'bad request', errors = null) {
    return this.error(res, message, 400, errors);
  }

  unauthorized(res, message = 'unauthorized') {
    return this.error(res, message, 401);
  }

  forbidden(res, message = 'forbidden') {
    return this.error(res, message, 403);
  }

  notFound(res, message = 'not found') {
    return this.error(res, message, 404);
  }

  conflict(res, message = 'conflict') {
    return this.error(res, message, 409);
  }

  tooManyRequests(res, message = 'too many requests') {
    return this.error(res, message, 429);
  }

  internalError(res, message = 'internal server error') {
    return this.error(res, message, 500);
  }
}

module.exports = new ApiResponse();
