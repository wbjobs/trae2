import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

declare global {
  namespace Express {
    interface Response {
      sendSuccess: <T>(data?: T, message?: string) => void;
      sendError: (message: string, code?: number, errors?: unknown) => void;
    }
  }
}

export const responseHandler = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.sendSuccess = <T>(data?: T, message: string = 'Success'): void => {
    const response: ApiResponse<T> = {
      success: true,
      code: 200,
      message,
      data,
      timestamp: Date.now(),
      requestId: res.req.requestId,
    };
    res.status(200).json(response);
  };

  res.sendError = (message: string, code: number = 400): void => {
    const response: ApiResponse = {
      success: false,
      code,
      message,
      timestamp: Date.now(),
      requestId: res.req.requestId,
    };
    res.status(code).json(response);
  };

  next();
};

export const requestLogger = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const duration = Date.now() - req.startTime;
  logger.info('Request processed:', {
    method: req.method,
    path: req.path,
    requestId: req.requestId,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
};
