import { Context } from 'koa';
import { logger } from 'shared/index';
import {
  RawPacket,
  ParsedPacket,
  ForwardResponse,
  ServiceHealth,
  QueueStats,
  ROUTING_KEYS,
} from 'shared/index';
import queueService from '../services/QueueService';
import filterService from '../services/FilterService';
import trafficDistributor from '../services/TrafficDistributor';

const startTime = Date.now();
const version = process.env.SERVICE_VERSION || '1.0.0';

interface SourceStats {
  packets: number;
  bytes: number;
}

class AtomicStatsCounter {
  private _totalPackets = 0;
  private _totalBytes = 0;
  private _errors = 0;
  private _bySource: Map<string, SourceStats> = new Map();
  private lock = Promise.resolve();

  private async acquire(): Promise<() => void> {
    const release = () => {};
    const prevLock = this.lock;
    this.lock = this.lock.then(() => {});
    await prevLock;
    return release;
  }

  async incrementPackets(count: number, bytes: number, sourceId?: string): Promise<void> {
    const release = await this.acquire();
    try {
      this._totalPackets += count;
      this._totalBytes += bytes;

      if (sourceId) {
        const sourceStats = this._bySource.get(sourceId) || { packets: 0, bytes: 0 };
        sourceStats.packets += count;
        sourceStats.bytes += bytes;
        this._bySource.set(sourceId, sourceStats);
      }
    } finally {
      release();
    }
  }

  async incrementErrors(count: number = 1): Promise<void> {
    const release = await this.acquire();
    try {
      this._errors += count;
    } finally {
      release();
    }
  }

  async getSnapshot() {
    const release = await this.acquire();
    try {
      const sourceBreakdown: Array<{ sourceId: string; packets: number; bytes: number }> = [];
      for (const [sourceId, stats] of this._bySource.entries()) {
        sourceBreakdown.push({
          sourceId,
          packets: stats.packets,
          bytes: stats.bytes,
        });
      }
      sourceBreakdown.sort((a, b) => b.packets - a.packets);

      return {
        totalPackets: this._totalPackets,
        totalBytes: this._totalBytes,
        errors: this._errors,
        sourceBreakdown,
      };
    } finally {
      release();
    }
  }
}

const stats = new AtomicStatsCounter();

export class ForwardController {
  static async forwardRaw(ctx: Context): Promise<void> {
    if (queueService.isBufferFull()) {
      ctx.status = 429;
      ctx.body = {
        success: false,
        error: 'Buffer full, please retry later',
        message: 'Service is experiencing high load',
      } as ForwardResponse;
      return;
    }

    const packet = ctx.request.body as RawPacket;
    const sourceId = ctx.state.sourceId || packet.sourceId;

    logger.debug(`[ForwardController] Received raw packet from source: ${sourceId}, packetId: ${packet.id}`);

    try {
      const filterResult = filterService.filterMessage(packet);
      
      if (!filterResult.passed) {
        logger.info(`[ForwardController] Packet ${packet.id} blocked by filter: ${filterResult.reason}`);
        await stats.incrementErrors();
        
        ctx.status = 403;
        ctx.body = {
          success: false,
          error: filterResult.reason,
          message: 'Packet blocked by filter rules',
          data: {
            packetId: packet.id,
            sourceId,
            filterResult: {
              passed: filterResult.passed,
              reason: filterResult.reason,
              matchedRule: filterResult.matchedRule,
            },
            timestamp: Date.now(),
          },
        } as ForwardResponse;
        return;
      }

      await queueService.publishRawPacket(packet);
      await stats.incrementPackets(1, packet.payloadLength, sourceId);

      const response: ForwardResponse = {
        success: true,
        message: 'Packet forwarded successfully',
        data: {
          packetId: packet.id,
          sourceId,
          filterResult: {
            passed: filterResult.passed,
            reason: filterResult.reason,
            matchedRule: filterResult.matchedRule,
          },
          timestamp: Date.now(),
        },
      };

      ctx.status = 200;
      ctx.body = response;

      logger.debug(`[ForwardController] Packet ${packet.id} forwarded to queue`);
    } catch (error) {
      await stats.incrementErrors();
      logger.error(`[ForwardController] Failed to forward packet ${packet.id}:`, error);

      const response: ForwardResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to forward packet',
      };

      ctx.status = 503;
      ctx.body = response;
    }
  }

  static async forwardBatch(ctx: Context): Promise<void> {
    if (queueService.isBufferFull()) {
      ctx.status = 429;
      ctx.body = {
        success: false,
        error: 'Buffer full, please retry later',
        message: 'Service is experiencing high load',
      } as ForwardResponse;
      return;
    }

    const body = ctx.request.body as { packets: RawPacket[] };
    const packets = body.packets;

    logger.debug(`[ForwardController] Received batch request with ${packets.length} packets`);

    const filterResults = filterService.filterBatch(packets);
    const { passed: passedPackets, blocked } = filterResults;

    const results: Array<{
      packetId: string;
      sourceId: string;
      destination?: string;
      success: boolean;
      blocked?: boolean;
      filterReason?: string;
      matchedRuleId?: string;
      error?: string;
    }> = [];

    for (const { message, result } of blocked) {
      results.push({
        packetId: message.id,
        sourceId: message.sourceId,
        success: false,
        blocked: true,
        filterReason: result.reason,
        matchedRuleId: result.matchedRule?.id,
      });
    }

    try {
      const sourceId = ctx.state.sourceId || packets[0]?.sourceId || 'unknown';
      const distributionResult = await trafficDistributor.distributeBatch(passedPackets, sourceId);

      const distributedPackets = distributionResult.distributed.map((item) => ({
        ...item.message,
        metadata: {
          ...item.message.metadata,
          destination: item.destination,
        },
      }));

      const batchResult = await queueService.publishBatch(
        ROUTING_KEYS.RAW_PACKET,
        distributedPackets
      );

      let successCount = batchResult.success;
      let errorCount = blocked.length + batchResult.dropped + distributionResult.dropped.length;

      let totalBytes = 0;
      const sourceCounts: Map<string, { count: number; bytes: number }> = new Map();

      for (const item of distributionResult.distributed) {
        const packet = item.message;
        const packetSourceId = packet.sourceId;
        totalBytes += packet.payloadLength;

        const sourceStats = sourceCounts.get(packetSourceId) || { count: 0, bytes: 0 };
        sourceStats.count++;
        sourceStats.bytes += packet.payloadLength;
        sourceCounts.set(packetSourceId, sourceStats);

        results.push({
          packetId: packet.id,
          sourceId: packetSourceId,
          destination: item.destination,
          success: true,
        });
      }

      for (const item of distributionResult.dropped) {
        results.push({
          packetId: item.message.id,
          sourceId: item.message.sourceId,
          success: false,
          error: item.reason,
        });
      }

      for (const [sourceId, sourceStats] of sourceCounts.entries()) {
        await stats.incrementPackets(sourceStats.count, sourceStats.bytes, sourceId);
      }

      await stats.incrementErrors(errorCount);

      const response: ForwardResponse = {
        success: errorCount === 0,
        message: `Batch processed: ${successCount} succeeded, ${blocked.length} blocked, ${errorCount - blocked.length} failed`,
        data: {
          total: packets.length,
          successCount,
          blockedCount: blocked.length,
          errorCount,
          distributed: distributionResult.distributed.length,
          dropped: distributionResult.dropped.length,
          results,
          timestamp: Date.now(),
        },
      };

      ctx.status = errorCount === 0 ? 200 : 207;
      ctx.body = response;

      logger.info(`[ForwardController] Batch processed: ${successCount}/${packets.length} packets, ${blocked.length} blocked, ${distributionResult.dropped.length} dropped by distributor`);
    } catch (error) {
      await stats.incrementErrors(packets.length);
      logger.error('[ForwardController] Failed to process batch:', error);

      for (const packet of packets) {
        results.push({
          packetId: packet.id,
          sourceId: packet.sourceId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      const response: ForwardResponse = {
        success: false,
        message: 'Batch processing failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {
          total: packets.length,
          successCount: 0,
          errorCount: packets.length,
          results,
          timestamp: Date.now(),
        },
      };

      ctx.status = 500;
      ctx.body = response;
    }
  }

  static async forwardParsed(ctx: Context): Promise<void> {
    if (queueService.isBufferFull()) {
      ctx.status = 429;
      ctx.body = {
        success: false,
        error: 'Buffer full, please retry later',
        message: 'Service is experiencing high load',
      } as ForwardResponse;
      return;
    }

    const body = ctx.request.body as { packets: ParsedPacket[] };
    const packets = body.packets;
    const sourceId = ctx.state.sourceId || 'packet-parser';

    logger.debug(`[ForwardController] Received parsed packet batch with ${packets.length} packets from source: ${sourceId}`);

    const filterResults = filterService.filterBatch(packets);
    const { passed: passedPackets, blocked } = filterResults;

    const results: Array<{
      packetId: string;
      sourceId: string;
      destination?: string;
      success: boolean;
      blocked?: boolean;
      filterReason?: string;
      matchedRuleId?: string;
      error?: string;
    }> = [];

    for (const { message, result } of blocked) {
      results.push({
        packetId: message.id,
        sourceId,
        success: false,
        blocked: true,
        filterReason: result.reason,
        matchedRuleId: result.matchedRule?.id,
      });
    }

    try {
      const distributionResult = await trafficDistributor.distributeBatch(passedPackets, sourceId);

      const distributedPackets = distributionResult.distributed.map((item) => ({
        ...item.message,
        metadata: {
          ...(item.message as any).metadata,
          destination: item.destination,
        },
      }));

      const batchResult = await queueService.publishBatch(
        ROUTING_KEYS.PARSED_MESSAGE,
        distributedPackets
      );

      let successCount = batchResult.success;
      let errorCount = blocked.length + batchResult.dropped + distributionResult.dropped.length;

      let totalBytes = 0;
      for (const item of distributionResult.distributed) {
        const packet = item.message;
        totalBytes += packet.length;
        results.push({
          packetId: packet.id,
          sourceId,
          destination: item.destination,
          success: true,
        });
      }

      for (const item of distributionResult.dropped) {
        results.push({
          packetId: item.message.id,
          sourceId,
          success: false,
          error: item.reason,
        });
      }

      await stats.incrementPackets(successCount, totalBytes, sourceId);
      await stats.incrementErrors(errorCount);

      const response: ForwardResponse = {
        success: errorCount === 0,
        message: `Parsed batch processed: ${successCount} succeeded, ${blocked.length} blocked, ${errorCount - blocked.length} failed`,
        data: {
          total: packets.length,
          successCount,
          blockedCount: blocked.length,
          errorCount,
          distributed: distributionResult.distributed.length,
          dropped: distributionResult.dropped.length,
          results,
          timestamp: Date.now(),
        },
      };

      ctx.status = errorCount === 0 ? 200 : 207;
      ctx.body = response;

      logger.info(`[ForwardController] Parsed batch processed: ${successCount}/${packets.length} packets, ${blocked.length} blocked, ${distributionResult.dropped.length} dropped by distributor`);
    } catch (error) {
      await stats.incrementErrors(packets.length);
      logger.error('[ForwardController] Failed to process parsed batch:', error);

      for (const packet of packets) {
        results.push({
          packetId: packet.id,
          sourceId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      const response: ForwardResponse = {
        success: false,
        message: 'Parsed batch processing failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {
          total: packets.length,
          successCount: 0,
          errorCount: packets.length,
          results,
          timestamp: Date.now(),
        },
      };

      ctx.status = 500;
      ctx.body = response;
    }
  }

  static async healthCheck(ctx: Context): Promise<void> {
    const rabbitmqConnected = queueService.isConnected();
    const uptime = Date.now() - startTime;
    const bufferSize = queueService.getBufferSize();
    const bufferFull = queueService.isBufferFull();

    const status: ServiceHealth['status'] = rabbitmqConnected && !bufferFull ? 'healthy' : 'unhealthy';

    const health: ServiceHealth = {
      status,
      timestamp: Date.now(),
      uptime,
      rabbitmqConnected,
      version,
      bufferSize,
      bufferFull,
    };

    const response: ForwardResponse<ServiceHealth> = {
      success: status === 'healthy',
      data: health,
      message: status === 'healthy' ? 'Service is healthy' : 'Service is unhealthy',
    };

    ctx.status = status === 'healthy' ? 200 : 503;
    ctx.body = response;

    logger.debug(`[ForwardController] Health check: ${status}`);
  }

  static async getStats(ctx: Context): Promise<void> {
    const uptime = Date.now() - startTime;
    const statsSnapshot = await stats.getSnapshot();

    let queueStats: QueueStats[] = [];
    try {
      queueStats = await queueService.getAllQueueStats();
    } catch (error) {
      logger.warn('[ForwardController] Failed to get queue stats:', error);
    }

    const bufferMetrics = queueService.getBufferMetrics();
    const bufferSize = queueService.getBufferSize();

    const response: ForwardResponse = {
      success: true,
      data: {
        service: {
          version,
          uptime,
          startTime,
        },
        packets: {
          total: statsSnapshot.totalPackets,
          totalBytes: statsSnapshot.totalBytes,
          errors: statsSnapshot.errors,
          perSecond: statsSnapshot.totalPackets / (uptime / 1000),
        },
        sources: {
          count: statsSnapshot.sourceBreakdown.length,
          breakdown: statsSnapshot.sourceBreakdown,
        },
        buffer: {
          size: bufferSize,
          isFull: queueService.isBufferFull(),
          metrics: bufferMetrics,
        },
        queues: queueStats,
        timestamp: Date.now(),
      },
    };

    ctx.status = 200;
    ctx.body = response;
  }
}

export default ForwardController;
