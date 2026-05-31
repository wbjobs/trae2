import { Request, Response } from 'express';
import { thresholdEngine } from '../services/threshold-engine.service';
import { ThresholdRule, ThresholdConfig } from '../types';
import { alarmEventRepository } from '../database/repositories/AlarmEventRepository';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { messageQueueService } from '../services/message-queue.service';
import { metricsCollector } from '../services/metrics.service';
import { distributedLockService } from '../services/distributed-lock.service';
import { distributedRateLimiter } from '../services/rate-limiter.service';
import { dataProcessingPipeline } from '../services/data-pipeline.service';
import { terminalLivenessDetector } from '../services/terminal-liveness.service';
import { batchProcessingService } from '../services/batch-processor.service';
import { AlarmLevel } from '../types';

export class AdminController {
  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = metricsCollector.getMetrics();
      res.sendSuccess(metrics);
    } catch (err) {
      logger.error('Error getting metrics:', err);
      res.sendError('Failed to get metrics', 500);
    }
  }

  async addRule(req: Request, res: Response): Promise<void> {
    try {
      const rule = req.body as Partial<ThresholdRule>;

      if (!rule.metricName || rule.threshold === undefined) {
        res.sendError('Missing required fields: metricName and threshold are required', 400);
        return;
      }

      const newRule: ThresholdRule = {
        id: uuidv4(),
        metricName: rule.metricName,
        operator: rule.operator || '>',
        threshold: rule.threshold,
        alarmLevel: rule.alarmLevel || AlarmLevel.WARNING,
        enabled: rule.enabled !== undefined ? rule.enabled : true,
        minDuration: rule.minDuration || 0,
        description: rule.description || '',
        dynamicAdjustable: rule.dynamicAdjustable !== undefined ? rule.dynamicAdjustable : true,
        consecutiveCount: rule.consecutiveCount || 1,
        cooldownPeriod: rule.cooldownPeriod || 60000,
      };

      thresholdEngine.addRule(newRule);
      res.sendSuccess(newRule, 'Rule added successfully');
    } catch (err) {
      logger.error('Error adding rule:', err);
      res.sendError('Failed to add rule', 500);
    }
  }

  async removeRule(req: Request, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;
      const success = thresholdEngine.deleteRule(ruleId);

      if (!success) {
        res.sendError('Rule not found', 404);
        return;
      }

      res.sendSuccess({ removed: true }, 'Rule removed successfully');
    } catch (err) {
      logger.error('Error removing rule:', err);
      res.sendError('Failed to remove rule', 500);
    }
  }

  async listRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = thresholdEngine.getAllRules();
      res.sendSuccess({
        rules,
        total: rules.length,
      });
    } catch (err) {
      logger.error('Error listing rules:', err);
      res.sendError('Failed to list rules', 500);
    }
  }

  async listAlarms(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const pageSize = parseInt(req.query.pageSize as string, 10) || 50;
      const level = req.query.level as string | undefined;

      const { alarms, total } = await alarmEventRepository.getTerminalAlarms(
        '',
        page,
        pageSize
      );

      res.sendSuccess({
        items: alarms,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (err) {
      logger.error('Error listing alarms:', err);
      res.sendError('Failed to list alarms', 500);
    }
  }

  async getQueueStats(req: Request, res: Response): Promise<void> {
    try {
      const isConnected = messageQueueService.isConnected();
      res.sendSuccess({
        connected: isConnected,
      });
    } catch (err) {
      logger.error('Error getting queue stats:', err);
      res.sendError('Failed to get queue stats', 500);
    }
  }

  async retryDLQ(req: Request, res: Response): Promise<void> {
    try {
      res.sendSuccess({ retried: 0, message: 'DLQ retry not implemented' });
    } catch (err) {
      logger.error('Error retrying DLQ:', err);
      res.sendError('Failed to retry DLQ', 500);
    }
  }

  async getThresholdConfig(req: Request, res: Response): Promise<void> {
    try {
      const config: ThresholdConfig = {
        defaults: thresholdEngine.getAllRules(),
        consecutiveThreshold: 3,
        autoReset: true,
        autoResetTimeout: 300000,
      };
      res.sendSuccess(config);
    } catch (err) {
      logger.error('Error getting threshold config:', err);
      res.sendError('Failed to get threshold config', 500);
    }
  }

  async updateThresholdConfig(req: Request, res: Response): Promise<void> {
    try {
      const { metricName } = req.params;
      const update = req.body;

      thresholdEngine.updateRule(metricName, update);
      res.sendSuccess({ updated: true, metricName }, 'Threshold config updated successfully');
    } catch (err) {
      logger.error('Error updating threshold config:', err);
      res.sendError('Failed to update threshold config', 500);
    }
  }

  async getLockStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = distributedLockService.getStats();
      res.sendSuccess(stats);
    } catch (err) {
      logger.error('Error getting lock stats:', err);
      res.sendError('Failed to get lock stats', 500);
    }
  }

  async getRateLimitStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = distributedRateLimiter.getStats();
      res.sendSuccess(stats);
    } catch (err) {
      logger.error('Error getting rate limit stats:', err);
      res.sendError('Failed to get rate limit stats', 500);
    }
  }

  async getPipelineStats(req: Request, res: Response): Promise<void> {
    try {
      const handlers = dataProcessingPipeline.getHandlers();
      const isEnabled = dataProcessingPipeline.isEnabled();

      res.sendSuccess({
        enabled: isEnabled,
        handlers,
        totalHandlers: handlers.length,
      });
    } catch (err) {
      logger.error('Error getting pipeline stats:', err);
      res.sendError('Failed to get pipeline stats', 500);
    }
  }

  async togglePipelineHandler(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const { enabled } = req.body as { enabled?: boolean };

      const currentHandlers = dataProcessingPipeline.getHandlers();
      const handler = currentHandlers.find((h) => h.name === name);

      if (!handler) {
        res.sendError(`Handler "${name}" not found`, 404);
        return;
      }

      const newState = enabled !== undefined ? enabled : !handler.enabled;
      dataProcessingPipeline.setHandlerEnabled(name, newState);

      res.sendSuccess(
        { name, enabled: newState },
        `Handler "${name}" ${newState ? 'enabled' : 'disabled'}`
      );
    } catch (err) {
      logger.error('Error toggling pipeline handler:', err);
      res.sendError('Failed to toggle pipeline handler', 500);
    }
  }

  async getLivenessStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = terminalLivenessDetector.getStats();
      res.sendSuccess(stats);
    } catch (err) {
      logger.error('Error getting liveness stats:', err);
      res.sendError('Failed to get liveness stats', 500);
    }
  }

  async getBatchStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = batchProcessingService.getStats();
      res.sendSuccess(stats);
    } catch (err) {
      logger.error('Error getting batch stats:', err);
      res.sendError('Failed to get batch stats', 500);
    }
  }
}
