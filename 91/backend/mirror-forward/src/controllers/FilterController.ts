import { Context } from 'koa';
import { logger } from 'shared/index';
import {
  FilterRule,
  ForwardResponse,
  RawPacket,
  ParsedPacket,
  SignalingMessage,
} from 'shared/index';
import filterService from '../services/FilterService';

function generateId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export class FilterController {
  static async listRules(ctx: Context): Promise<void> {
    try {
      const rules = filterService.getAllRules();

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: {
          rules,
          total: rules.length,
          enabledCount: rules.filter(r => r.enabled).length,
          disabledCount: rules.filter(r => !r.enabled).length,
        },
        message: `Retrieved ${rules.length} filter rules`,
      } as ForwardResponse;

      logger.debug(`[FilterController] Listed ${rules.length} filter rules`);
    } catch (error) {
      logger.error('[FilterController] Failed to list rules:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to list filter rules',
      } as ForwardResponse;
    }
  }

  static async createRule(ctx: Context): Promise<void> {
    try {
      const body = ctx.request.body as Partial<FilterRule>;

      if (!body.type || !body.field || !body.operator || body.value === undefined) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Missing required fields: type, field, operator, value',
          message: 'Invalid rule data',
        } as ForwardResponse;
        return;
      }

      const rule: FilterRule = {
        id: body.id || generateId(),
        type: body.type,
        field: body.field,
        operator: body.operator,
        value: body.value,
        enabled: body.enabled !== undefined ? body.enabled : true,
        priority: body.priority !== undefined ? body.priority : 0,
        description: body.description,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const createdRule = await filterService.addRule(rule);

      ctx.status = 201;
      ctx.body = {
        success: true,
        data: createdRule,
        message: 'Filter rule created successfully',
      } as ForwardResponse;

      logger.info(`[FilterController] Created filter rule: ${createdRule.id}`);
    } catch (error) {
      logger.error('[FilterController] Failed to create rule:', error);

      const statusCode = error instanceof Error && (error as any).statusCode
        ? (error as any).statusCode
        : 500;

      ctx.status = statusCode;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to create filter rule',
      } as ForwardResponse;
    }
  }

  static async getRule(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;
      const rule = filterService.getRule(id);

      if (!rule) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: `Rule with id ${id} not found`,
          message: 'Rule not found',
        } as ForwardResponse;
        return;
      }

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: rule,
        message: 'Filter rule retrieved successfully',
      } as ForwardResponse;

      logger.debug(`[FilterController] Retrieved filter rule: ${id}`);
    } catch (error) {
      logger.error('[FilterController] Failed to get rule:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to get filter rule',
      } as ForwardResponse;
    }
  }

  static async updateRule(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;
      const updates = ctx.request.body as Partial<FilterRule>;

      const updatedRule = await filterService.updateRule(id, updates);

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: updatedRule,
        message: 'Filter rule updated successfully',
      } as ForwardResponse;

      logger.info(`[FilterController] Updated filter rule: ${id}`);
    } catch (error) {
      logger.error('[FilterController] Failed to update rule:', error);

      const statusCode = error instanceof Error && (error as any).statusCode
        ? (error as any).statusCode
        : 500;

      ctx.status = statusCode;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to update filter rule',
      } as ForwardResponse;
    }
  }

  static async deleteRule(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;
      await filterService.removeRule(id);

      ctx.status = 200;
      ctx.body = {
        success: true,
        message: `Filter rule ${id} deleted successfully`,
      } as ForwardResponse;

      logger.info(`[FilterController] Deleted filter rule: ${id}`);
    } catch (error) {
      logger.error('[FilterController] Failed to delete rule:', error);

      const statusCode = error instanceof Error && (error as any).statusCode
        ? (error as any).statusCode
        : 500;

      ctx.status = statusCode;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to delete filter rule',
      } as ForwardResponse;
    }
  }

  static async enableRule(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;
      const rule = await filterService.enableRule(id);

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: rule,
        message: `Filter rule ${id} enabled successfully`,
      } as ForwardResponse;

      logger.info(`[FilterController] Enabled filter rule: ${id}`);
    } catch (error) {
      logger.error('[FilterController] Failed to enable rule:', error);

      const statusCode = error instanceof Error && (error as any).statusCode
        ? (error as any).statusCode
        : 500;

      ctx.status = statusCode;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to enable filter rule',
      } as ForwardResponse;
    }
  }

  static async disableRule(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;
      const rule = await filterService.disableRule(id);

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: rule,
        message: `Filter rule ${id} disabled successfully`,
      } as ForwardResponse;

      logger.info(`[FilterController] Disabled filter rule: ${id}`);
    } catch (error) {
      logger.error('[FilterController] Failed to disable rule:', error);

      const statusCode = error instanceof Error && (error as any).statusCode
        ? (error as any).statusCode
        : 500;

      ctx.status = statusCode;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to disable filter rule',
      } as ForwardResponse;
    }
  }

  static async getStats(ctx: Context): Promise<void> {
    try {
      const stats = filterService.getStats();

      const serializableStats = {
        ...stats,
        byRule: Object.fromEntries(stats.byRule.entries()),
        byField: Object.fromEntries(stats.byField.entries()),
      };

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: serializableStats,
        message: 'Filter statistics retrieved successfully',
      } as ForwardResponse;

      logger.debug('[FilterController] Retrieved filter statistics');
    } catch (error) {
      logger.error('[FilterController] Failed to get stats:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to get filter statistics',
      } as ForwardResponse;
    }
  }

  static async resetStats(ctx: Context): Promise<void> {
    try {
      filterService.resetStats();

      ctx.status = 200;
      ctx.body = {
        success: true,
        message: 'Filter statistics reset successfully',
      } as ForwardResponse;

      logger.info('[FilterController] Reset filter statistics');
    } catch (error) {
      logger.error('[FilterController] Failed to reset stats:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to reset filter statistics',
      } as ForwardResponse;
    }
  }

  static async testMessage(ctx: Context): Promise<void> {
    try {
      const body = ctx.request.body as {
        message: RawPacket | ParsedPacket | SignalingMessage;
      };

      if (!body.message) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Missing message in request body',
          message: 'Invalid test data',
        } as ForwardResponse;
        return;
      }

      const testResult = filterService.testMessage(body.message);

      const serializableResult = {
        result: testResult.result,
        evaluatedRules: testResult.evaluatedRules.map(er => ({
          ...er,
          rule: er.rule,
        })),
      };

      ctx.status = 200;
      ctx.body = {
        success: true,
        data: serializableResult,
        message: 'Message test completed',
      } as ForwardResponse;

      logger.debug(`[FilterController] Tested message, passed: ${testResult.result.passed}`);
    } catch (error) {
      logger.error('[FilterController] Failed to test message:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to test message',
      } as ForwardResponse;
    }
  }
}

export default FilterController;
