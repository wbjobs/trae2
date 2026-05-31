import { Request, Response, NextFunction } from 'express';
import { dataValidator } from '../services/data-validator.service';
import { TerminalData } from '../types';

export const validateTerminalData = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const data = req.body as TerminalData;
  
  const validationResult = dataValidator.validate(data);
  
  if (!validationResult.valid) {
    res.status(400).json({
      success: false,
      code: 400,
      message: 'Data validation failed',
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      timestamp: Date.now(),
      requestId: req.requestId,
    });
    return;
  }

  req.body.validationWarnings = validationResult.warnings;
  next();
};
