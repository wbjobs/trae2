import { Response } from 'express';

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
  timestamp: number;
}

export const success = <T>(res: Response, data?: T, message = 'success'): Response => {
  return res.json({
    code: 0,
    message,
    data,
    timestamp: Date.now(),
  });
};

export const error = (res: Response, code: number, message: string, statusCode = 400): Response => {
  return res.status(statusCode).json({
    code,
    message,
    timestamp: Date.now(),
  });
};

export const serverError = (res: Response, message = 'Internal Server Error'): Response => {
  return res.status(500).json({
    code: 500,
    message,
    timestamp: Date.now(),
  });
};
