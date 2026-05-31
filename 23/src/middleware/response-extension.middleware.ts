import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Response {
      sendSuccess: <T>(data?: T, message?: string) => void;
      sendError: (message: string, code?: number, errors?: unknown) => void;
    }
  }
}

export const responseExtensionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.sendSuccess = <T>(data?: T, message: string = 'Success'): void => {
    res.json({
      success: true,
      code: 200,
      message,
      data,
      timestamp: Date.now(),
      requestId: req.requestId,
    });
  };

  res.sendError = (message: string, code: number = 500, errors?: unknown): void => {
    res.status(code).json({
      success: false,
      code,
      message,
      errors,
      timestamp: Date.now(),
      requestId: req.requestId,
    });
  };

  next();
};
