import { Context } from 'koa';
import { logger } from 'shared/index';
import {
  TrafficSource,
  DistributionRule,
  ForwardResponse,
} from 'shared/index';
import trafficDistributor from '../services/TrafficDistributor';

export class DistributionController {
  static async getSources(ctx: Context): Promise<void> {
    logger.debug('[DistributionController] Getting all traffic sources');

    const sources = trafficDistributor.getAllSources();

    const response: ForwardResponse<TrafficSource[]> = {
      success: true,
      data: sources,
      message: `Retrieved ${sources.length} traffic sources`,
    };

    ctx.status = 200;
    ctx.body = response;
  }

  static async createSource(ctx: Context): Promise<void> {
    const body = ctx.request.body as Partial<TrafficSource>;

    logger.debug('[DistributionController] Creating traffic source:', body);

    if (!body.id || !body.name) {
      const response: ForwardResponse = {
        success: false,
        error: 'Missing required fields: id and name are required',
        message: 'Failed to create traffic source',
      };

      ctx.status = 400;
      ctx.body = response;
      return;
    }

    const source: TrafficSource = {
      id: body.id,
      name: body.name,
      weight: body.weight ?? 1,
      priority: body.priority ?? 1,
      maxBandwidth: body.maxBandwidth ?? 100 * 1024 * 1024,
      currentBandwidth: 0,
      status: body.status ?? 'active',
      lastSeen: Date.now(),
    };

    trafficDistributor.registerSource(source);

    const response: ForwardResponse<TrafficSource> = {
      success: true,
      data: source,
      message: 'Traffic source created successfully',
    };

    ctx.status = 201;
    ctx.body = response;
  }

  static async updateSource(ctx: Context): Promise<void> {
    const { id } = ctx.params;
    const body = ctx.request.body as Partial<TrafficSource>;

    logger.debug(`[DistributionController] Updating traffic source ${id}:`, body);

    const existing = trafficDistributor.getSource(id);
    if (!existing) {
      const response: ForwardResponse = {
        success: false,
        error: `Traffic source ${id} not found`,
        message: 'Failed to update traffic source',
      };

      ctx.status = 404;
      ctx.body = response;
      return;
    }

    const updates: Partial<TrafficSource> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.weight !== undefined) updates.weight = body.weight;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.maxBandwidth !== undefined) updates.maxBandwidth = body.maxBandwidth;
    if (body.status !== undefined) updates.status = body.status;

    const updated = trafficDistributor.updateSource(id, updates);

    if (updated) {
      const response: ForwardResponse<TrafficSource> = {
        success: true,
        data: trafficDistributor.getSource(id),
        message: 'Traffic source updated successfully',
      };

      ctx.status = 200;
      ctx.body = response;
    } else {
      const response: ForwardResponse = {
        success: false,
        error: 'Failed to update traffic source',
        message: 'Failed to update traffic source',
      };

      ctx.status = 500;
      ctx.body = response;
    }
  }

  static async deleteSource(ctx: Context): Promise<void> {
    const { id } = ctx.params;

    logger.debug(`[DistributionController] Deleting traffic source ${id}`);

    const deleted = trafficDistributor.unregisterSource(id);

    if (deleted) {
      const response: ForwardResponse = {
        success: true,
        message: `Traffic source ${id} deleted successfully`,
      };

      ctx.status = 200;
      ctx.body = response;
    } else {
      const response: ForwardResponse = {
        success: false,
        error: `Traffic source ${id} not found`,
        message: 'Failed to delete traffic source',
      };

      ctx.status = 404;
      ctx.body = response;
    }
  }

  static async getRules(ctx: Context): Promise<void> {
    logger.debug('[DistributionController] Getting all distribution rules');

    const rules = trafficDistributor.getAllRules();

    const response: ForwardResponse<DistributionRule[]> = {
      success: true,
      data: rules,
      message: `Retrieved ${rules.length} distribution rules`,
    };

    ctx.status = 200;
    ctx.body = response;
  }

  static async createRule(ctx: Context): Promise<void> {
    const body = ctx.request.body as Partial<DistributionRule>;

    logger.debug('[DistributionController] Creating distribution rule:', body);

    if (!body.id || !body.name || !body.type || !body.sources || !body.destinations) {
      const response: ForwardResponse = {
        success: false,
        error: 'Missing required fields: id, name, type, sources, and destinations are required',
        message: 'Failed to create distribution rule',
      };

      ctx.status = 400;
      ctx.body = response;
      return;
    }

    const validTypes: DistributionRule['type'][] = ['hash', 'weighted', 'priority', 'round_robin'];
    if (!validTypes.includes(body.type)) {
      const response: ForwardResponse = {
        success: false,
        error: `Invalid rule type. Must be one of: ${validTypes.join(', ')}`,
        message: 'Failed to create distribution rule',
      };

      ctx.status = 400;
      ctx.body = response;
      return;
    }

    const rule: DistributionRule = {
      id: body.id,
      name: body.name,
      type: body.type,
      sources: body.sources,
      destinations: body.destinations,
      hashKey: body.hashKey,
      enabled: body.enabled ?? true,
      createdAt: Date.now(),
    };

    trafficDistributor.addRule(rule);

    const response: ForwardResponse<DistributionRule> = {
      success: true,
      data: rule,
      message: 'Distribution rule created successfully',
    };

    ctx.status = 201;
    ctx.body = response;
  }

  static async updateRule(ctx: Context): Promise<void> {
    const { id } = ctx.params;
    const body = ctx.request.body as Partial<DistributionRule>;

    logger.debug(`[DistributionController] Updating distribution rule ${id}:`, body);

    const existing = trafficDistributor.getRule(id);
    if (!existing) {
      const response: ForwardResponse = {
        success: false,
        error: `Distribution rule ${id} not found`,
        message: 'Failed to update distribution rule',
      };

      ctx.status = 404;
      ctx.body = response;
      return;
    }

    const updatedRule: DistributionRule = {
      ...existing,
    };

    if (body.name !== undefined) updatedRule.name = body.name;
    if (body.type !== undefined) updatedRule.type = body.type;
    if (body.sources !== undefined) updatedRule.sources = body.sources;
    if (body.destinations !== undefined) updatedRule.destinations = body.destinations;
    if (body.hashKey !== undefined) updatedRule.hashKey = body.hashKey;
    if (body.enabled !== undefined) updatedRule.enabled = body.enabled;

    trafficDistributor.removeRule(id);
    trafficDistributor.addRule(updatedRule);

    const response: ForwardResponse<DistributionRule> = {
      success: true,
      data: updatedRule,
      message: 'Distribution rule updated successfully',
    };

    ctx.status = 200;
    ctx.body = response;
  }

  static async deleteRule(ctx: Context): Promise<void> {
    const { id } = ctx.params;

    logger.debug(`[DistributionController] Deleting distribution rule ${id}`);

    const deleted = trafficDistributor.removeRule(id);

    if (deleted) {
      const response: ForwardResponse = {
        success: true,
        message: `Distribution rule ${id} deleted successfully`,
      };

      ctx.status = 200;
      ctx.body = response;
    } else {
      const response: ForwardResponse = {
        success: false,
        error: `Distribution rule ${id} not found`,
        message: 'Failed to delete distribution rule',
      };

      ctx.status = 404;
      ctx.body = response;
    }
  }

  static async getStats(ctx: Context): Promise<void> {
    logger.debug('[DistributionController] Getting distribution statistics');

    const stats = trafficDistributor.getStats();

    const serializableStats = {
      totalDistributed: stats.totalDistributed,
      bySource: Object.fromEntries(stats.bySource),
      byDestination: Object.fromEntries(stats.byDestination),
      currentLoad: Object.fromEntries(stats.currentLoad),
    };

    const response: ForwardResponse = {
      success: true,
      data: serializableStats,
      message: 'Retrieved distribution statistics',
    };

    ctx.status = 200;
    ctx.body = response;
  }

  static async resetStats(ctx: Context): Promise<void> {
    logger.debug('[DistributionController] Resetting distribution statistics');

    trafficDistributor.resetStats();

    const response: ForwardResponse = {
      success: true,
      message: 'Distribution statistics reset successfully',
    };

    ctx.status = 200;
    ctx.body = response;
  }
}

export default DistributionController;
