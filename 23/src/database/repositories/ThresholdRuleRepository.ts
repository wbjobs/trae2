import { Repository, FindManyOptions } from 'typeorm';
import { ThresholdRuleEntity } from '../models/ThresholdRule';
import { AppDataSource } from '../data-source';
import { ThresholdRule } from '../../types';
import logger from '../../utils/logger';

export class ThresholdRuleRepository {
  private repository: Repository<ThresholdRuleEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(ThresholdRuleEntity);
  }

  async create(rule: Omit<ThresholdRule, 'id'>): Promise<ThresholdRuleEntity> {
    const entity = this.repository.create({
      metricName: rule.metricName,
      terminalType: rule.terminalType,
      terminalId: rule.terminalId,
      minValue: rule.minValue,
      maxValue: rule.maxValue,
      alarmLevel: rule.alarmLevel,
      enabled: rule.enabled,
      description: rule.description,
      consecutiveCount: rule.consecutiveCount,
      cooldownPeriod: rule.cooldownPeriod,
    });

    return this.repository.save(entity);
  }

  async findById(ruleId: string): Promise<ThresholdRuleEntity | null> {
    return this.repository.findOneBy({ id: ruleId });
  }

  async list(
    page: number = 1,
    pageSize: number = 50,
    filters?: {
      metricName?: string;
      enabled?: boolean;
      terminalId?: string;
    }
  ): Promise<{ rules: ThresholdRuleEntity[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (filters?.metricName) where.metricName = filters.metricName;
    if (filters?.enabled !== undefined) where.enabled = filters.enabled;
    if (filters?.terminalId) where.terminalId = filters.terminalId;

    const options: FindManyOptions<ThresholdRuleEntity> = {
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    };

    const [rules, total] = await this.repository.findAndCount(options);
    return { rules, total };
  }

  async update(ruleId: string, updates: Partial<ThresholdRule>): Promise<ThresholdRuleEntity | null> {
    const rule = await this.findById(ruleId);
    if (!rule) return null;

    Object.assign(rule, updates);
    return this.repository.save(rule);
  }

  async delete(ruleId: string): Promise<boolean> {
    const result = await this.repository.delete(ruleId);
    return (result.affected || 0) > 0;
  }

  async getAllEnabled(): Promise<ThresholdRuleEntity[]> {
    return this.repository.find({ where: { enabled: true } });
  }

  async getByTerminal(terminalId: string): Promise<ThresholdRuleEntity[]> {
    return this.repository.find({
      where: [
        { enabled: true, terminalId },
        { enabled: true, terminalId: undefined as unknown as string },
      ],
    });
  }

  async getByMetric(metricName: string): Promise<ThresholdRuleEntity[]> {
    return this.repository.find({ where: { metricName, enabled: true } });
  }

  async setEnabled(ruleId: string, enabled: boolean): Promise<ThresholdRuleEntity | null> {
    const rule = await this.findById(ruleId);
    if (!rule) return null;

    rule.enabled = enabled;
    return this.repository.save(rule);
  }

  async syncToEngine(): Promise<ThresholdRule[]> {
    const enabledRules = await this.getAllEnabled();
    logger.info('Synced threshold rules from database:', { count: enabledRules.length });

    return enabledRules.map((entity) => ({
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
    }));
  }
}

export const thresholdRuleRepository = new ThresholdRuleRepository();
