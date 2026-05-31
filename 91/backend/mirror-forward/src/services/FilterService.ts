import { createClient, RedisClientType } from 'redis';
import { logger, AppError } from 'shared/index';
import {
  FilterRule,
  FilterResult,
  FilterStats,
  SignalingMessage,
  RawPacket,
  ParsedPacket,
} from 'shared/index';

type FilterableMessage = SignalingMessage | RawPacket | ParsedPacket;

interface RuleMatchCache {
  ruleId: string;
  hitCount: number;
  lastHitAt: number;
}

export class FilterService {
  private rules: Map<string, FilterRule> = new Map();
  private sortedRules: FilterRule[] = [];
  private stats: FilterStats;
  private redisClient: RedisClientType | null = null;
  private redisKeyPrefix = 'filter_rules:';
  private matchCache: Map<string, RuleMatchCache> = new Map();
  private maxCacheSize = 1000;
  private initialized = false;

  constructor() {
    this.stats = {
      totalProcessed: 0,
      totalBlocked: 0,
      totalPassed: 0,
      byRule: new Map(),
      byField: new Map(),
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.connectRedis();
      await this.loadRulesFromDB();
      this.initialized = true;
      logger.info('[FilterService] Initialized successfully');
    } catch (error) {
      logger.warn('[FilterService] Redis connection failed, using in-memory storage only:', error);
      this.initialized = true;
    }
  }

  private async connectRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const enabled = process.env.REDIS_ENABLED !== 'false';

    if (!enabled) {
      logger.info('[FilterService] Redis disabled by configuration');
      return;
    }

    try {
      this.redisClient = createClient({ url: redisUrl }) as RedisClientType;
      
      this.redisClient.on('error', (err) => {
        logger.error('[FilterService] Redis Client Error:', err);
      });

      this.redisClient.on('connect', () => {
        logger.info('[FilterService] Redis connected');
      });

      await this.redisClient.connect();
    } catch (error) {
      logger.error('[FilterService] Failed to connect to Redis:', error);
      throw error;
    }
  }

  async loadRulesFromDB(): Promise<void> {
    if (!this.redisClient) {
      logger.warn('[FilterService] Redis not available, skipping rule loading');
      return;
    }

    try {
      const keys = await this.redisClient.keys(`${this.redisKeyPrefix}*`);
      this.rules.clear();

      for (const key of keys) {
        const ruleData = await this.redisClient.get(key);
        if (ruleData) {
          const rule = JSON.parse(ruleData) as FilterRule;
          this.rules.set(rule.id, rule);
        }
      }

      this.sortRules();
      logger.info(`[FilterService] Loaded ${this.rules.size} rules from Redis`);
    } catch (error) {
      logger.error('[FilterService] Failed to load rules from Redis:', error);
      throw new AppError('Failed to load filter rules', 500, 'FILTER_LOAD_ERROR');
    }
  }

  async saveRulesToDB(): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      for (const rule of this.rules.values()) {
        const key = `${this.redisKeyPrefix}${rule.id}`;
        await this.redisClient.set(key, JSON.stringify(rule));
      }
      logger.debug(`[FilterService] Saved ${this.rules.size} rules to Redis`);
    } catch (error) {
      logger.error('[FilterService] Failed to save rules to Redis:', error);
      throw new AppError('Failed to save filter rules', 500);
    }
  }

  private async saveRuleToDB(rule: FilterRule): Promise<void> {
    if (!this.redisClient) return;

    try {
      const key = `${this.redisKeyPrefix}${rule.id}`;
      await this.redisClient.set(key, JSON.stringify(rule));
    } catch (error) {
      logger.error('[FilterService] Failed to save rule to Redis:', error);
    }
  }

  private async deleteRuleFromDB(ruleId: string): Promise<void> {
    if (!this.redisClient) return;

    try {
      const key = `${this.redisKeyPrefix}${ruleId}`;
      await this.redisClient.del(key);
    } catch (error) {
      logger.error('[FilterService] Failed to delete rule from Redis:', error);
    }
  }

  private sortRules(): void {
    this.sortedRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  private validateRule(rule: Partial<FilterRule>): void {
    if (rule.type !== undefined && !['whitelist', 'blacklist'].includes(rule.type)) {
      throw new AppError('Invalid rule type. Must be "whitelist" or "blacklist"', 400);
    }

    const validFields = ['source_ip', 'dest_ip', 'source_port', 'dest_port', 'signaling_type', 'protocol', 'device_id', 'payload'];
    if (rule.field !== undefined && !validFields.includes(rule.field)) {
      throw new AppError(`Invalid field. Must be one of: ${validFields.join(', ')}`, 400);
    }

    const validOperators = ['eq', 'neq', 'contains', 'not_contains', 'regex', 'in', 'not_in', 'gt', 'lt', 'gte', 'lte'];
    if (rule.operator !== undefined && !validOperators.includes(rule.operator)) {
      throw new AppError(`Invalid operator. Must be one of: ${validOperators.join(', ')}`, 400);
    }

    if (rule.priority !== undefined && (typeof rule.priority !== 'number' || rule.priority < 0)) {
      throw new AppError('Priority must be a non-negative number', 400, 'INVALID_PRIORITY');
    }

    if (rule.operator !== undefined && rule.value !== undefined) {
      if (['in', 'not_in'].includes(rule.operator) && !Array.isArray(rule.value)) {
        throw new AppError('Value must be an array for "in" or "not_in" operators', 400
      }
      if (['gt', 'lt', 'gte', 'lte'].includes(rule.operator) && typeof rule.value !== 'number') {
        throw new AppError('Value must be a number for comparison operators', 400);
      }
    }
  }

  async addRule(rule: FilterRule): Promise<FilterRule> {
    this.validateRule(rule);

    if (this.rules.has(rule.id)) {
      throw new AppError(`Rule with id ${rule.id} already exists`, 409, 'RULE_ALREADY_EXISTS');
    }

    const now = Date.now();
    const newRule: FilterRule = {
      ...rule,
      createdAt: now,
      updatedAt: now,
    };

    this.rules.set(rule.id, newRule);
    this.sortRules();
    await this.saveRuleToDB(newRule);

    logger.info(`[FilterService] Added rule: ${rule.id} (${rule.type})`);
    return newRule;
  }

  async removeRule(ruleId: string): Promise<void> {
    if (!this.rules.has(ruleId)) {
      throw new AppError(`Rule with id ${ruleId} not found`, 404, 'RULE_NOT_FOUND');
    }

    this.rules.delete(ruleId);
    this.sortRules();
    this.stats.byRule.delete(ruleId);
    await this.deleteRuleFromDB(ruleId);

    logger.info(`[FilterService] Removed rule: ${ruleId}`);
  }

  async updateRule(ruleId: string, updates: Partial<FilterRule>): Promise<FilterRule> {
    const existingRule = this.rules.get(ruleId);
    if (!existingRule) {
      throw new AppError(`Rule with id ${ruleId} not found`, 404, 'RULE_NOT_FOUND');
    }

    if (updates.id !== undefined && updates.id !== ruleId) {
      throw new AppError('Cannot change rule id', 400, 'CANNOT_CHANGE_RULE_ID');
    }

    this.validateRule(updates);

    const updatedRule: FilterRule = {
      ...existingRule,
      ...updates,
      updatedAt: Date.now(),
    };

    this.rules.set(ruleId, updatedRule);
    this.sortRules();
    await this.saveRuleToDB(updatedRule);

    logger.info(`[FilterService] Updated rule: ${ruleId}`);
    return updatedRule;
  }

  async enableRule(ruleId: string): Promise<FilterRule> {
    return this.updateRule(ruleId, { enabled: true });
  }

  async disableRule(ruleId: string): Promise<FilterRule> {
    return this.updateRule(ruleId, { enabled: false });
  }

  getRule(ruleId: string): FilterRule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): FilterRule[] {
    return Array.from(this.rules.values());
  }

  private getMessageField(message: FilterableMessage, field: FilterRule['field']): string | number | undefined {
    switch (field) {
      case 'source_ip':
        return (message as SignalingMessage).source_ip || (message as RawPacket).srcIp || (message as ParsedPacket).sourceIp;
      case 'dest_ip':
        return (message as SignalingMessage).dest_ip || (message as RawPacket).dstIp || (message as ParsedPacket).destinationIp;
      case 'source_port':
        return (message as SignalingMessage).source_port || (message as RawPacket).srcPort || (message as ParsedPacket).sourcePort;
      case 'dest_port':
        return (message as SignalingMessage).dest_port || (message as RawPacket).dstPort || (message as ParsedPacket).destinationPort;
      case 'signaling_type':
        return (message as SignalingMessage).signaling_type;
      case 'protocol':
        return (message as SignalingMessage).protocol || String((message as RawPacket).protocol) || String((message as ParsedPacket).protocol);
      case 'device_id':
        return (message as SignalingMessage).device_id || (message as RawPacket).sourceId || (message as ParsedPacket).interfaceId;
      case 'payload':
        return (message as SignalingMessage).payload || (message as RawPacket).payload || (message as ParsedPacket).rawData;
      default:
        return undefined;
    }
  }

  private matchField(fieldValue: string | number | undefined, rule: FilterRule): boolean {
    if (fieldValue === undefined) {
      return false;
    }

    const ruleValue = rule.value;
    const operator = rule.operator;

    switch (operator) {
      case 'eq':
        return String(fieldValue) === String(ruleValue);
      case 'neq':
        return String(fieldValue) !== String(ruleValue);
      case 'contains':
        return String(fieldValue).includes(String(ruleValue));
      case 'not_contains':
        return !String(fieldValue).includes(String(ruleValue));
      case 'regex':
        try {
          const regex = new RegExp(String(ruleValue));
          return regex.test(String(fieldValue));
        } catch {
          return false;
        }
      case 'in':
        return Array.isArray(ruleValue) && ruleValue.includes(String(fieldValue));
      case 'not_in':
        return Array.isArray(ruleValue) && !ruleValue.includes(String(fieldValue));
      case 'gt':
        return Number(fieldValue) > Number(ruleValue);
      case 'lt':
        return Number(fieldValue) < Number(ruleValue);
      case 'gte':
        return Number(fieldValue) >= Number(ruleValue);
      case 'lte':
        return Number(fieldValue) <= Number(ruleValue);
      default:
        return false;
    }
  }

  private updateCache(ruleId: string): void {
    const cache = this.matchCache.get(ruleId) || { ruleId, hitCount: 0, lastHitAt: 0 };
    cache.hitCount++;
    cache.lastHitAt = Date.now();
    this.matchCache.set(ruleId, cache);

    if (this.matchCache.size > this.maxCacheSize) {
      const sorted = Array.from(this.matchCache.values()).sort((a, b) => b.hitCount - a.hitCount);
      const toRemove = sorted.slice(this.maxCacheSize / 2);
      for (const item of toRemove) {
        this.matchCache.delete(item.ruleId);
      }
    }
  }

  private updateStats(rule: FilterRule | null, passed: boolean, field: string): void {
    this.stats.totalProcessed++;

    if (passed) {
      this.stats.totalPassed++;
    } else {
      this.stats.totalBlocked++;
    }

    if (rule) {
      const ruleStats = this.stats.byRule.get(rule.id) || { matched: 0, lastMatchedAt: 0 };
      ruleStats.matched++;
      ruleStats.lastMatchedAt = Date.now();
      this.stats.byRule.set(rule.id, ruleStats);
      this.updateCache(rule.id);
    }

    const fieldStats = this.stats.byField.get(field) || { blocked: 0, passed: 0 };
    if (passed) {
      fieldStats.passed++;
    } else {
      fieldStats.blocked++;
    }
    this.stats.byField.set(field, fieldStats);
  }

  filterMessage(message: FilterableMessage): FilterResult {
    for (const rule of this.sortedRules) {
      const fieldValue = this.getMessageField(message, rule.field);
      const matched = this.matchField(fieldValue, rule);

      if (matched) {
        this.updateStats(rule, rule.type === 'whitelist', rule.field);

        if (rule.type === 'blacklist') {
          return {
            passed: false,
            matchedRule: rule,
            reason: `Blocked by blacklist rule: ${rule.id}`,
          };
        } else {
          return {
            passed: true,
            matchedRule: rule,
            reason: `Allowed by whitelist rule: ${rule.id}`,
          };
        }
      }
    }

    this.updateStats(null, true, 'none');
    return {
      passed: true,
      reason: 'No matching rules, default allow',
    };
  }

  filterBatch<T extends FilterableMessage>(messages: T[]): {
    passed: T[];
    blocked: Array<{ message: T; result: FilterResult }>;
  } {
    const passed: T[] = [];
    const blocked: Array<{ message: T; result: FilterResult }> = [];

    for (const message of messages) {
      const result = this.filterMessage(message);
      if (result.passed) {
        passed.push(message);
      } else {
        blocked.push({ message, result });
      }
    }

    return { passed, blocked };
  }

  getStats(): FilterStats {
    return {
      ...this.stats,
      byRule: new Map(this.stats.byRule),
      byField: new Map(this.stats.byField),
    };
  }

  resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      totalBlocked: 0,
      totalPassed: 0,
      byRule: new Map(),
      byField: new Map(),
    };
    logger.info('[FilterService] Statistics reset');
  }

  testMessage(message: FilterableMessage): {
    result: FilterResult;
    evaluatedRules: Array<{
      rule: FilterRule;
      matched: boolean;
      fieldValue: string | number | undefined;
    }>;
  } {
    const evaluatedRules: Array<{
      rule: FilterRule;
      matched: boolean;
      fieldValue: string | number | undefined;
    }> = [];

    for (const rule of this.sortedRules) {
      const fieldValue = this.getMessageField(message, rule.field);
      const matched = this.matchField(fieldValue, rule);
      evaluatedRules.push({ rule, matched, fieldValue });

      if (matched) {
        if (rule.type === 'blacklist') {
          return {
            result: {
              passed: false,
              matchedRule: rule,
              reason: `Blocked by blacklist rule: ${rule.id}`,
            },
            evaluatedRules,
          };
        } else {
          return {
            result: {
              passed: true,
              matchedRule: rule,
              reason: `Allowed by whitelist rule: ${rule.id}`,
            },
            evaluatedRules,
          };
        }
      }
    }

    return {
      result: {
        passed: true,
        reason: 'No matching rules, default allow',
      },
      evaluatedRules,
    };
  }

  async close(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        logger.info('[FilterService] Redis connection closed');
      } catch (error) {
        logger.error('[FilterService] Error closing Redis connection:', error);
      }
      this.redisClient = null;
    }
    this.initialized = false;
  }
}

export const filterService = new FilterService();
export default filterService;
