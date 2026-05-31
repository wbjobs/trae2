import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { ApiResponse } from '../types';

export class AppError extends Error {
  public readonly code: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: number = 500, isOperational: boolean = true) {
    super(message);
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const code = err instanceof AppError ? err.code : 500;
  const message =
    err instanceof AppError ? err.message : 'Internal Server Error';

  if (!(err instanceof AppError) || !err.isOperational) {
    logger.error('Unexpected error occurred:', {
      error: err.message,
      stack: err.stack,
      requestId: req.requestId,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.warn('Operational error:', {
      error: err.message,
      code,
      requestId: req.requestId,
      path: req.path,
      method: req.method,
    });
  }

  const response: ApiResponse = {
    success: false,
    code,
    message,
    timestamp: Date.now(),
    requestId: req.requestId,
  };

  res.status(code).json(response);
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const response: ApiResponse = {
    success: false,
    code: 404,
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: Date.now(),
    requestId: req.requestId,
  };
  res.status(404).json(response);
};
