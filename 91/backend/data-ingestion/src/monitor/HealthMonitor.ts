import http, { Server, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { HealthStatus, RabbitMQConfig } from '../shared/types/index';
import { Logger } from '../shared/utils/logger';
import { calculateRate, formatBytes } from '../shared/utils/helpers';
import { MessageConsumer } from '../services/MessageConsumer';
import { ClickHouseWriter } from '../services/ClickHouseWriter';
import { BatchProcessor } from '../services/BatchProcessor';

interface RateStats {
  consumptionRate: number;
  insertionRate: number;
  errorRate: number;
}

interface MonitorDependencies {
  consumer: MessageConsumer;
  writer: ClickHouseWriter;
  batchProcessor: BatchProcessor;
  rabbitmqConfig: RabbitMQConfig;
}

export class HealthMonitor {
  private server: Server | null = null;
  private port: number;
  private logger: Logger;
  private deps: MonitorDependencies;
  private startTime: number = Date.now();
  private lastStatsCheck: number = Date.now();
  private lastConsumedCount: number = 0;
  private lastInsertedCount: number = 0;
  private lastErrorCount: number = 0;
  private rateStats: RateStats = {
    consumptionRate: 0,
    insertionRate: 0,
    errorRate: 0
  };
  private statsUpdateInterval: NodeJS.Timeout | null = null;
  private readonly STATS_UPDATE_INTERVAL = 5000;

  constructor(port: number, deps: MonitorDependencies, logger: Logger) {
    this.port = port;
    this.deps = deps;
    this.logger = logger;
  }

  async start(): Promise<void> {
    this.logger.info('Starting health monitor server on port', { port: this.port });

    this.server = http.createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve, reject) => {
      if (!this.server) return reject(new Error('Server not created'));

      this.server.listen(this.port, () => {
        this.logger.info('Health monitor server started', { port: this.port });
        this.startStatsUpdater();
        resolve();
      });

      this.server.on('error', (error) => {
        this.logger.error('Health monitor server error', { error: error.message });
        reject(error);
      });
    });
  }

  private startStatsUpdater(): void {
    this.statsUpdateInterval = setInterval(() => {
      this.updateRateStats();
    }, this.STATS_UPDATE_INTERVAL);
  }

  private updateRateStats(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastStatsCheck;
    const elapsedSeconds = elapsedMs / 1000;

    const consumerStats = this.deps.consumer.getConsumerStats();
    const insertStats = this.deps.writer.getInsertStats();

    const currentConsumed = consumerStats.reduce((sum, s) => sum + s.messagesConsumed, 0);
    const currentInserted = insertStats.totalMessages;
    const currentErrors = consumerStats.reduce((sum, s) => sum + s.messagesFailed, 0) + insertStats.failureCount;

    if (elapsedSeconds > 0) {
      this.rateStats.consumptionRate =
        Math.round(((currentConsumed - this.lastConsumedCount) / elapsedSeconds) * 100) / 100;
      this.rateStats.insertionRate =
        Math.round(((currentInserted - this.lastInsertedCount) / elapsedSeconds) * 100) / 100;
      this.rateStats.errorRate =
        Math.round(((currentErrors - this.lastErrorCount) / elapsedSeconds) * 100) / 100;
    }

    this.lastConsumedCount = currentConsumed;
    this.lastInsertedCount = currentInserted;
    this.lastErrorCount = currentErrors;
    this.lastStatsCheck = now;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || '/', `http://localhost:${this.port}`);

      this.setCorsHeaders(res);

      if (req.method === 'GET' && url.pathname === '/health') {
        await this.handleHealthCheck(res);
      } else if (req.method === 'GET' && url.pathname === '/stats') {
        await this.handleStats(res);
      } else if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      this.logger.error('Request handling error', { error: (error as Error).message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  private async handleHealthCheck(res: ServerResponse): Promise<void> {
    const healthStatus = await this.getHealthStatus();

    const statusCode = healthStatus.status === 'healthy' ? 200 :
      healthStatus.status === 'degraded' ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthStatus, null, 2));
  }

  private async handleStats(res: ServerResponse): Promise<void> {
    const stats = await this.getDetailedStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const rabbitmqConnected = this.deps.consumer.isConnected();
    const clickhouseConnected = this.deps.writer.isConnected();

    const consumerStats = this.deps.consumer.getConsumerStats();
    const insertStats = this.deps.writer.getInsertStats();

    const parsedQueueLag = await this.deps.consumer.getQueueMessageCount(
      this.deps.rabbitmqConfig.parsedQueue
    );
    const metricsQueueLag = await this.deps.consumer.getQueueMessageCount(
      this.deps.rabbitmqConfig.metricsQueue
    );

    let status: HealthStatus['status'] = 'healthy';

    if (!rabbitmqConnected || !clickhouseConnected) {
      status = 'unhealthy';
    } else if (
      this.rateStats.errorRate > 10 ||
      parsedQueueLag > 10000 ||
      insertStats.failureCount > insertStats.successCount
    ) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: Date.now(),
      services: {
        rabbitmq: rabbitmqConnected ? 'connected' : 'disconnected',
        clickhouse: clickhouseConnected ? 'connected' : 'disconnected'
      },
      consumers: consumerStats,
      insertStats,
      queueLag: {
        parsed_messages: parsedQueueLag,
        metrics: metricsQueueLag
      }
    };
  }

  private async getDetailedStats(): Promise<unknown> {
    const healthStatus = await this.getHealthStatus();
    const batchStats = this.deps.batchProcessor.getStats();
    const batchSize = this.deps.batchProcessor.getCurrentBatchSize();
    const batchConfig = this.deps.batchProcessor.getConfig();
    const tableSizes = await this.deps.writer.getTableSizes();

    const consumerStats = this.deps.consumer.getConsumerStats();
    const insertStats = this.deps.writer.getInsertStats();

    const totalConsumed = consumerStats.reduce((sum, s) => sum + s.messagesConsumed, 0);
    const totalProcessed = consumerStats.reduce((sum, s) => sum + s.messagesProcessed, 0);
    const totalFailed = consumerStats.reduce((sum, s) => sum + s.messagesFailed, 0);

    const uptimeMs = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    return {
      timestamp: Date.now(),
      uptime: {
        ms: uptimeMs,
        formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`
      },
      health: healthStatus,
      rates: {
        ...this.rateStats,
        overallConsumptionRate: calculateRate(totalConsumed, this.startTime),
        overallInsertionRate: calculateRate(insertStats.totalMessages, this.startTime)
      },
      consumption: {
        totalConsumed,
        totalProcessed,
        totalFailed,
        byQueue: consumerStats
      },
      insertion: {
        ...insertStats,
        totalBytesFormatted: formatBytes(insertStats.totalBytes)
      },
      batching: {
        config: batchConfig,
        currentSize: batchSize,
        stats: {
          ...batchStats,
          flushLatencyHistory: undefined,
          batchSizeHistory: undefined
        },
        recentBatchSizes: batchStats.batchSizeHistory.slice(-10),
        recentFlushLatencies: batchStats.flushLatencyHistory.slice(-10),
        isBackpressured: this.deps.batchProcessor.isBackpressured()
      },
      storage: tableSizes.map(t => ({
        ...t,
        bytesFormatted: formatBytes(t.bytes)
      })),
      memory: {
        ...process.memoryUsage(),
        heapUsedFormatted: formatBytes(process.memoryUsage().heapUsed),
        heapTotalFormatted: formatBytes(process.memoryUsage().heapTotal),
        rssFormatted: formatBytes(process.memoryUsage().rss)
      }
    };
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping health monitor...');

    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
    }

    if (this.server) {
      return new Promise((resolve) => {
        if (!this.server) return resolve();
        this.server.close(() => {
          this.logger.info('Health monitor server stopped');
          this.server = null;
          resolve();
        });
      });
    }
  }
}
