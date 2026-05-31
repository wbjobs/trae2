import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const errorHandlerMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    path: req.path,
    method: req.method,
  });

  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
      timestamp: Date.now(),
      requestId: req.requestId,
    });
  }
};
