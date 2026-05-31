import { Request, Response } from 'express';
import { AlarmLevel, PaginatedResponse } from '../types';
import { alarmEventRepository } from '../database/repositories/AlarmEventRepository';
import logger from '../utils/logger';

export class AlarmController {
  async listAlarms(req: Request, res: Response): Promise<void> {
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50;
    const terminalId = req.query.terminalId as string | undefined;
    const alarmLevel = req.query.alarmLevel as AlarmLevel | undefined;
    const acknowledged = req.query.acknowledged !== undefined 
      ? req.query.acknowledged === 'true' 
      : undefined;
    const resolved = req.query.resolved !== undefined 
      ? req.query.resolved === 'true' 
      : undefined;

    try {
      const { alarms, total } = await alarmEventRepository.list(page, pageSize, {
        terminalId,
        alarmLevel,
        acknowledged,
        resolved,
      });

      const response: PaginatedResponse<typeof alarms[0]> = {
        items: alarms,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      res.sendSuccess(response);
    } catch (err) {
      logger.error('Error listing alarms:', err);
      res.sendError('Failed to list alarms', 500);
    }
  }

  async getAlarm(req: Request, res: Response): Promise<void> {
    const { alarmId } = req.params;

    try {
      const alarm = await alarmEventRepository.findById(alarmId);

      if (!alarm) {
        res.sendError('Alarm not found', 404);
        return;
      }

      res.sendSuccess(alarm);
    } catch (err) {
      logger.error('Error getting alarm:', err);
      res.sendError('Failed to get alarm', 500);
    }
  }

  async acknowledge(req: Request, res: Response): Promise<void> {
    const { alarmId } = req.params;
    const operator = req.body.operator as string | undefined;

    try {
      const alarm = await alarmEventRepository.acknowledge(alarmId, operator);

      if (!alarm) {
        res.sendError('Alarm not found', 404);
        return;
      }

      res.sendSuccess(alarm, 'Alarm acknowledged successfully');
    } catch (err) {
      logger.error('Error acknowledging alarm:', err);
      res.sendError('Failed to acknowledge alarm', 500);
    }
  }

  async resolve(req: Request, res: Response): Promise<void> {
    const { alarmId } = req.params;
    const note = req.body.note as string | undefined;

    try {
      const alarm = await alarmEventRepository.resolve(alarmId, note);

      if (!alarm) {
        res.sendError('Alarm not found', 404);
        return;
      }

      res.sendSuccess(alarm, 'Alarm resolved successfully');
    } catch (err) {
      logger.error('Error resolving alarm:', err);
      res.sendError('Failed to resolve alarm', 500);
    }
  }

  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await alarmEventRepository.getStats();
      res.sendSuccess(stats);
    } catch (err) {
      logger.error('Error getting alarm stats:', err);
      res.sendError('Failed to get alarm stats', 500);
    }
  }
}
