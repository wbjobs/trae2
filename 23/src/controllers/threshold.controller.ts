import { Request, Response } from 'express';
import { ThresholdRule, PaginatedResponse } from '../types';
import { thresholdRuleRepository } from '../database/repositories/ThresholdRuleRepository';
import { thresholdEngine } from '../services/threshold-engine.service';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class ThresholdController {
  async create(req: Request, res: Response): Promise<void> {
    const ruleData = req.body as Omit<ThresholdRule, 'id'>;

    try {
      const entity = await thresholdRuleRepository.create(ruleData);

      const rule: ThresholdRule = {
        id: entity.id,
        metricName: entity.metricName,
        terminalType: entity.terminalType,
        terminalId: entity.terminalId,
        minValue: entity.minValue,
        maxValue: entity.maxValue,
        alarmLevel: entity.alarmLevel,
        enabled: entity.enabled,
        description: entity.description,
        consecutiveCount: entity.consecutiveCount,
        cooldownPeriod: entity.cooldownPeriod,
      };

      thresholdEngine.addRule(rule);

      res.sendSuccess(rule, 'Threshold rule created successfully');
    } catch (err) {
      logger.error('Error creating threshold rule:', err);
      res.sendError('Failed to create threshold rule', 500);
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50;
    const metricName = req.query.metricName as string | undefined;
    const enabled = req.query.enabled !== undefined 
      ? req.query.enabled === 'true' 
      : undefined;
    const terminalId = req.query.terminalId as string | undefined;

    try {
      const { rules, total } = await thresholdRuleRepository.list(page, pageSize, {
        metricName,
        enabled,
        terminalId,
      });

      const response: PaginatedResponse<typeof rules[0]> = {
        items: rules,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      res.sendSuccess(response);
    } catch (err) {
      logger.error('Error listing threshold rules:', err);
      res.sendError('Failed to list threshold rules', 500);
    }
  }

  async get(req: Request, res: Response): Promise<void> {
    const { ruleId } = req.params;

    try {
      const rule = await thresholdRuleRepository.findById(ruleId);

      if (!rule) {
        res.sendError('Threshold rule not found', 404);
        return;
      }

      res.sendSuccess(rule);
    } catch (err) {
      logger.error('Error getting threshold rule:', err);
      res.sendError('Failed to get threshold rule', 500);
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    const { ruleId } = req.params;
    const updates = req.body as Partial<ThresholdRule>;

    try {
      const entity = await thresholdRuleRepository.update(ruleId, updates);

      if (!entity) {
        res.sendError('Threshold rule not found', 404);
        return;
      }

      const rule: ThresholdRule = {
        id: entity.id,
        metricName: entity.metricName,
        terminalType: entity.terminalType,
        terminalId: entity.terminalId,
        minValue: entity.minValue,
        maxValue: entity.maxValue,
        alarmLevel: entity.alarmLevel,
        enabled: entity.enabled,
        description: entity.description,
        consecutiveCount: entity.consecutiveCount,
        cooldownPeriod: entity.cooldownPeriod,
      };

      thresholdEngine.updateRule(ruleId, rule);

      res.sendSuccess(rule, 'Threshold rule updated successfully');
    } catch (err) {
      logger.error('Error updating threshold rule:', err);
      res.sendError('Failed to update threshold rule', 500);
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { ruleId } = req.params;

    try {
      const deleted = await thresholdRuleRepository.delete(ruleId);

      if (!deleted) {
        res.sendError('Threshold rule not found', 404);
        return;
      }

      thresholdEngine.deleteRule(ruleId);

      res.sendSuccess(null, 'Threshold rule deleted successfully');
    } catch (err) {
      logger.error('Error deleting threshold rule:', err);
      res.sendError('Failed to delete threshold rule', 500);
    }
  }

  async sync(req: Request, res: Response): Promise<void> {
    try {
      const rules = await thresholdRuleRepository.syncToEngine();

      thresholdEngine.clearCounters();
      rules.forEach((rule) => thresholdEngine.addRule(rule));

      res.sendSuccess(
        { syncedCount: rules.length },
        'Threshold rules synced successfully'
      );
    } catch (err) {
      logger.error('Error syncing threshold rules:', err);
      res.sendError('Failed to sync threshold rules', 500);
    }
  }
}
