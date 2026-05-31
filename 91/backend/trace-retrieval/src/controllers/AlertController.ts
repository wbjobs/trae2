import { Context } from 'koa';
import winston from 'winston';
import AlertService from '../services/AlertService';
import { AlertRule, AlertLevel } from '../../../shared/types';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

export class AlertController {
  private alertService: AlertService;

  constructor() {
    this.alertService = AlertService.getInstance();
  }

  public async getAlerts(ctx: Context): Promise<void> {
    try {
      const { limit = 100, level } = ctx.query as any;

      const alerts = this.alertService.getAlerts(
        Number(limit) || undefined,
        level as AlertLevel | undefined
      );

      ctx.body = {
        success: true,
        data: alerts,
        total: alerts.length,
        limit: Number(limit) || 'all',
        level: level || 'all'
      };
    } catch (error) {
      logger.error('Get alerts error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message
      };
    }
  }

  public async getStats(ctx: Context): Promise<void> {
    try {
      const stats = this.alertService.getStats();

      ctx.body = {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.error('Get alert stats error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message
      };
    }
  }

  public async acknowledgeAlert(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;
      const { userId } = ctx.request.body as any;

      if (!id) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Alert ID is required'
        };
        return;
      }

      const alert = this.alertService.acknowledgeAlert(id, userId);

      if (!alert) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: 'Alert not found'
        };
        return;
      }

      ctx.body = {
        success: true,
        data: alert,
        message: 'Alert acknowledged successfully'
      };
    } catch (error) {
      logger.error('Acknowledge alert error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message
      };
    }
  }

  public async getRules(ctx: Context): Promise<void> {
    try {
      const rules = this.alertService.getRules();

      ctx.body = {
        success: true,
        data: rules,
        total: rules.length
      };
    } catch (error) {
      logger.error('Get alert rules error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message
      };
    }
  }

  public async createRule(ctx: Context): Promise<void> {
    try {
      const ruleData = ctx.request.body as Partial<AlertRule>;

      if (!ruleData.name) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Rule name is required'
        };
        return;
      }

      if (!ruleData.type) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Rule type is required'
        };
        return;
      }

      if (!ruleData.conditions || !Array.isArray(ruleData.conditions) || ruleData.conditions.length === 0) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'At least one condition is required'
        };
        return;
      }

      const newRule = this.alertService.addRule({
        ...ruleData,
        id: '',
        enabled: ruleData.enabled !== undefined ? ruleData.enabled : true,
        level: ruleData.level || 'warning',
        actions: ruleData.actions || [{ type: 'websocket', config: {} }],
        createdAt: 0,
        updatedAt: 0
      } as AlertRule);

      ctx.status = 201;
      ctx.body = {
        success: true,
        data: newRule,
        message: 'Alert rule created successfully'
      };
    } catch (error) {
      logger.error('Create alert rule error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message
      };
    }
  }

  public async updateRule(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;
      const updates = ctx.request.body as Partial<AlertRule>;

      if (!id) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Rule ID is required'
        };
        return;
      }

      const updatedRule = this.alertService.updateRule(id, updates);

      if (!updatedRule) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: 'Alert rule not found'
        };
        return;
      }

      ctx.body = {
        success: true,
        data: updatedRule,
        message: 'Alert rule updated successfully'
      };
    } catch (error) {
      logger.error('Update alert rule error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message
      };
    }
  }

  public async deleteRule(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;

      if (!id) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Rule ID is required'
        };
        return;
      }

      const deleted = this.alertService.removeRule(id);

      if (!deleted) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: 'Alert rule not found'
        };
        return;
      }

      ctx.body = {
        success: true,
        message: 'Alert rule deleted successfully'
      };
    } catch (error) {
      logger.error('Delete alert rule error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message
      };
    }
  }

  public async enableRule(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;

      if (!id) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Rule ID is required'
        };
        return;
      }

      const updatedRule = this.alertService.updateRule(id, { enabled: true });

      if (!updatedRule) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: 'Alert rule not found'
        };
        return;
      }

      ctx.body = {
        success: true,
        data: updatedRule,
        message: 'Alert rule enabled successfully'
      };
    } catch (error) {
      logger.error('Enable alert rule error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message
      };
    }
  }

  public async disableRule(ctx: Context): Promise<void> {
    try {
      const { id } = ctx.params;

      if (!id) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Rule ID is required'
        };
        return;
      }

      const updatedRule = this.alertService.updateRule(id, { enabled: false });

      if (!updatedRule) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: 'Alert rule not found'
        };
        return;
      }

      ctx.body = {
        success: true,
        data: updatedRule,
        message: 'Alert rule disabled successfully'
      };
    } catch (error) {
      logger.error('Disable alert rule error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: (error as Error).message
      };
    }
  }
}

export default AlertController;
