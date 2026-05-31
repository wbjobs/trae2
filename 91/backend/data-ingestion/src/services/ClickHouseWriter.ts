import { createClient, ClickHouseClient, DataFormat } from '@clickhouse/client';
import { SignalingMessage, MetricsData, ClickHouseConfig, BatchInsertStats } from '../shared/types/index';
import { Logger } from '../shared/utils/logger';
import { ClickHouseConnectionError, BatchInsertError } from '../shared/utils/errors';
import { withRetry } from '../shared/utils/helpers';

interface InsertLatencyRecord {
  timestamp: number;
  latencyMs: number;
}

interface ConnectionPool {
  clients: ClickHouseClient[];
  currentIndex: number;
  maxSize: number;
}

interface RateLimiter {
  tokens: number;
  maxTokens: number;
  refillRate: number;
  lastRefill: number;
}

export class ClickHouseWriter {
  private connectionPool: ConnectionPool;
  private config: ClickHouseConfig;
  private logger: Logger;
  private stats: BatchInsertStats;
  private latencyHistory: InsertLatencyRecord[] = [];
  private readonly maxLatencyHistory = 100;
  private readonly SIGNALS_TABLE = 'signaling_messages';
  private readonly METRICS_TABLE = 'metrics';
  private rateLimiter: RateLimiter;
  private readonly maxConcurrentInserts: number;
  private currentInsertCount = 0;
  private insertQueue: Array<() => void> = [];

  constructor(config: ClickHouseConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.maxConcurrentInserts = parseInt(process.env.CLICKHOUSE_MAX_CONCURRENT_INSERTS || '4', 10);
    this.connectionPool = {
      clients: [],
      currentIndex: 0,
      maxSize: this.maxConcurrentInserts
    };
    const maxInsertsPerSecond = parseInt(process.env.CLICKHOUSE_MAX_INSERTS_PER_SECOND || '10', 10);
    this.rateLimiter = {
      tokens: maxInsertsPerSecond,
      maxTokens: maxInsertsPerSecond,
      refillRate: maxInsertsPerSecond,
      lastRefill: Date.now()
    };
    this.stats = {
      totalMessages: 0,
      totalBytes: 0,
      insertCount: 0,
      successCount: 0,
      failureCount: 0,
      lastInsertTime: null,
      averageInsertLatencyMs: 0
    };
  }

  private refillRateLimiter(): void {
    const now = Date.now();
    const elapsed = (now - this.rateLimiter.lastRefill) / 1000;
    if (elapsed > 0) {
      const newTokens = Math.floor(elapsed * this.rateLimiter.refillRate);
      if (newTokens > 0) {
        this.rateLimiter.tokens = Math.min(
          this.rateLimiter.maxTokens,
          this.rateLimiter.tokens + newTokens
        );
        this.rateLimiter.lastRefill = now;
      }
    }
  }

  private async acquireInsertSlot(): Promise<void> {
    this.refillRateLimiter();

    if (this.rateLimiter.tokens > 0 && this.currentInsertCount < this.maxConcurrentInserts) {
      this.rateLimiter.tokens--;
      this.currentInsertCount++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.insertQueue.push(resolve);
    });
  }

  private releaseInsertSlot(): void {
    this.currentInsertCount--;
    this.refillRateLimiter();

    while (this.insertQueue.length > 0 && this.rateLimiter.tokens > 0 && this.currentInsertCount < this.maxConcurrentInserts) {
      const next = this.insertQueue.shift();
      if (next) {
        this.rateLimiter.tokens--;
        this.currentInsertCount++;
        next();
      }
    }
  }

  private getClient(): ClickHouseClient {
    if (this.connectionPool.clients.length === 0) {
      throw new Error('Connection pool not initialized');
    }
    const client = this.connectionPool.clients[this.connectionPool.currentIndex];
    this.connectionPool.currentIndex = (this.connectionPool.currentIndex + 1) % this.connectionPool.clients.length;
    return client;
  }

  async init(): Promise<void> {
    try {
      this.logger.info('Initializing ClickHouse connection pool...', {
        host: this.config.host,
        database: this.config.database,
        poolSize: this.connectionPool.maxSize
      });

      for (let i = 0; i < this.connectionPool.maxSize; i++) {
        const client = createClient({
          url: this.config.host,
          username: this.config.username,
          password: this.config.password,
          database: this.config.database,
          clickhouse_settings: {
            allow_experimental_object_type: 1,
            output_format_json_quote_64bit_integers: 0,
            async_insert: 1,
            wait_for_async_insert: 0
          },
          keep_alive: {
            enabled: true,
            idle_socket_ttl: 60000
          },
          request_timeout: 30000
        });
        this.connectionPool.clients.push(client);
      }

      await this.ensureTablesExist();
      await this.checkConnection();

      this.logger.info('ClickHouse connection pool initialized successfully');
    } catch (error) {
      throw new ClickHouseConnectionError(
        'Failed to initialize ClickHouse',
        error as Error,
        { host: this.config.host, database: this.config.database }
      );
    }
  }

  async checkConnection(): Promise<void> {
    if (this.connectionPool.clients.length === 0) {
      throw new Error('Connection pool not initialized');
    }

    try {
      const client = this.getClient();
      const result = await client.query({
        query: 'SELECT 1 as health_check',
        format: 'JSONEachRow'
      });

      const data = await result.json();
      if (!Array.isArray(data) || data.length === 0 || (data[0] as { health_check: number }).health_check !== 1) {
        throw new Error('Health check query returned unexpected result');
      }

      this.logger.debug('ClickHouse connection verified');
    } catch (error) {
      throw new ClickHouseConnectionError(
        'ClickHouse health check failed',
        error as Error
      );
    }
  }

  private async ensureTablesExist(): Promise<void> {
    const client = this.getClient();

    const createDatabaseQuery = `
      CREATE DATABASE IF NOT EXISTS ${this.config.database}
    `;

    const createSignalsTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.SIGNALS_TABLE} (
        id String,
        timestamp DateTime64(3),
        device_id String,
        device_name String,
        signaling_type String,
        protocol String,
        source_ip String,
        dest_ip String,
        source_port UInt16,
        dest_port UInt16,
        payload String,
        length UInt32,
        status String,
        raw_data String,
        hash String,
        created_at DateTime DEFAULT now()
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (device_id, timestamp, signaling_type)
      SETTINGS index_granularity = 8192
    `;

    const createMetricsTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.METRICS_TABLE} (
        id String,
        timestamp DateTime64(3),
        service String,
        metricType String,
        value Float64,
        unit String,
        tags Map(String, String),
        host Nullable(String),
        pid Nullable(Int32),
        environment Nullable(String),
        insertTime DateTime64(3) DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (timestamp, service, metricType)
      SETTINGS index_granularity = 8192
    `;

    try {
      await client.exec({ query: `CREATE DATABASE IF NOT EXISTS ${this.config.database}` });
      await client.exec({ query: createSignalsTableQuery });
      await client.exec({ query: createMetricsTableQuery });

      this.logger.info('Tables ensured successfully');
    } catch (error) {
      this.logger.warn('Table creation warning (may already exist)', { error: (error as Error).message });
    }
  }

  private formatSignalingMessageForTSV(msg: SignalingMessage): string {
    const escapeTSV = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined) return '\\N';
      const str = String(value);
      return str.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n');
    };

    return [
      escapeTSV(msg.id),
      new Date(msg.timestamp).toISOString(),
      escapeTSV(msg.device_id),
      escapeTSV(msg.device_name),
      escapeTSV(msg.signaling_type),
      escapeTSV(msg.protocol),
      escapeTSV(msg.source_ip),
      escapeTSV(msg.dest_ip),
      msg.source_port,
      msg.dest_port,
      escapeTSV(msg.payload),
      msg.length,
      escapeTSV(msg.status),
      escapeTSV(msg.raw_data),
      escapeTSV(msg.hash)
    ].join('\t');
  }

  private formatMetricsDataForTSV(data: MetricsData): string {
    const escapeTSV = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined) return '\\N';
      const str = String(value);
      return str.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n');
    };

    const formatTags = (tags: Record<string, string>): string => {
      const entries = Object.entries(tags)
        .map(([k, v]) => `${escapeTSV(k)}=${escapeTSV(v)}`)
        .join(',');
      return `{${entries}}`;
    };

    return [
      escapeTSV(data.id),
      new Date(data.timestamp).toISOString(),
      escapeTSV(data.service),
      escapeTSV(data.metricType),
      data.value,
      escapeTSV(data.unit),
      formatTags(data.tags || {}),
      escapeTSV(data.host),
      data.pid ?? '\\N',
      escapeTSV(data.environment)
    ].join('\t');
  }

  async insertSignalingBatchAsync(messages: SignalingMessage[]): Promise<void> {
    if (messages.length === 0) return;

    await this.acquireInsertSlot();

    const startTime = Date.now();
    let bytes = 0;

    try {
      await withRetry(
        async () => {
          await this.checkConnection();
          const client = this.getClient();

          const tsvData = messages.map(msg => this.formatSignalingMessageForTSV(msg)).join('\n') + '\n';
          bytes = Buffer.byteLength(tsvData, 'utf8');

          await client.insert({
            table: this.SIGNALS_TABLE,
            values: tsvData,
            format: 'TabSeparated' as DataFormat
          });
        },
        3,
        1000,
        (error) => {
          this.logger.warn('Signaling insert retry', { error: error.message, messages: messages.length });
          return true;
        }
      );

      const latency = Date.now() - startTime;
      this.updateStats(true, messages.length, bytes, latency);

      this.logger.debug('Signaling batch inserted (TSV)', {
        count: messages.length,
        bytes,
        latencyMs: latency
      });
    } catch (error) {
      this.updateStats(false, messages.length, bytes, Date.now() - startTime);

      throw new BatchInsertError(
        `Failed to insert signaling batch of ${messages.length} messages`,
        error as Error,
        { count: messages.length, bytes }
      );
    } finally {
      this.releaseInsertSlot();
    }
  }

  async insertSignalingBatch(messages: SignalingMessage[]): Promise<void> {
    await this.insertSignalingBatchAsync(messages);
  }

  async insertMetricsBatchAsync(metrics: MetricsData[]): Promise<void> {
    if (metrics.length === 0) return;

    await this.acquireInsertSlot();

    const startTime = Date.now();
    let bytes = 0;

    try {
      await withRetry(
        async () => {
          await this.checkConnection();
          const client = this.getClient();

          const tsvData = metrics.map(m => this.formatMetricsDataForTSV(m)).join('\n') + '\n';
          bytes = Buffer.byteLength(tsvData, 'utf8');

          await client.insert({
            table: this.METRICS_TABLE,
            values: tsvData,
            format: 'TabSeparated' as DataFormat
          });
        },
        3,
        1000,
        (error) => {
          this.logger.warn('Metrics insert retry', { error: error.message, count: metrics.length });
          return true;
        }
      );

      const latency = Date.now() - startTime;
      this.updateStats(true, metrics.length, bytes, latency);

      this.logger.debug('Metrics batch inserted (TSV)', {
        count: metrics.length,
        bytes,
        latencyMs: latency
      });
    } catch (error) {
      this.updateStats(false, metrics.length, bytes, Date.now() - startTime);

      throw new BatchInsertError(
        `Failed to insert metrics batch of ${metrics.length} records`,
        error as Error,
        { count: metrics.length, bytes }
      );
    } finally {
      this.releaseInsertSlot();
    }
  }

  async insertMetricsBatch(metrics: MetricsData[]): Promise<void> {
    await this.insertMetricsBatchAsync(metrics);
  }

  private updateStats(success: boolean, count: number, bytes: number, latencyMs: number): void {
    this.stats.totalMessages += count;
    this.stats.totalBytes += bytes;
    this.stats.insertCount++;
    this.stats.lastInsertTime = Date.now();

    if (success) {
      this.stats.successCount++;
    } else {
      this.stats.failureCount++;
    }

    this.latencyHistory.push({ timestamp: Date.now(), latencyMs });
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
    }

    const totalLatency = this.latencyHistory.reduce((sum, r) => sum + r.latencyMs, 0);
    this.stats.averageInsertLatencyMs = Math.round((totalLatency / this.latencyHistory.length) * 100) / 100;
  }

  async optimizeTable(tableName?: string): Promise<void> {
    const client = this.getClient();
    const tables = tableName ? [tableName] : [this.SIGNALS_TABLE, this.METRICS_TABLE];

    for (const table of tables) {
      try {
        this.logger.info('Optimizing table', { table });

        await client.exec({
          query: `OPTIMIZE TABLE ${table} FINAL`
        });

        this.logger.info('Table optimized successfully', { table });
      } catch (error) {
        this.logger.error('Table optimization failed', {
          table,
          error: (error as Error).message
        });
      }
    }
  }

  getInsertStats(): BatchInsertStats {
    return { ...this.stats };
  }

  getPoolInfo(): {
    poolSize: number;
    activeConnections: number;
    currentIndex: number;
    queueDepth: number;
    currentInsertCount: number;
    availableTokens: number;
  } {
    return {
      poolSize: this.connectionPool.maxSize,
      activeConnections: this.connectionPool.clients.length,
      currentIndex: this.connectionPool.currentIndex,
      queueDepth: this.insertQueue.length,
      currentInsertCount: this.currentInsertCount,
      availableTokens: this.rateLimiter.tokens
    };
  }

  async getTableSizes(): Promise<{ table: string; rows: number; bytes: number }[]> {
    const client = this.getClient();

    const query = `
      SELECT
        table,
        sum(rows) as rows,
        sum(bytes_on_disk) as bytes
      FROM system.parts
      WHERE database = '${this.config.database}'
        AND table IN ('${this.SIGNALS_TABLE}', '${this.METRICS_TABLE}')
        AND active
      GROUP BY table
    `;

    try {
      const result = await client.query({
        query,
        format: 'JSONEachRow'
      });

      const data = await result.json() as Array<{ table: string; rows: string; bytes: string }>;
      return data.map(row => ({
        table: row.table,
        rows: parseInt(row.rows, 10),
        bytes: parseInt(row.bytes, 10)
      }));
    } catch (error) {
      this.logger.error('Failed to get table sizes', { error: (error as Error).message });
      return [];
    }
  }

  isConnected(): boolean {
    return this.connectionPool.clients.length > 0;
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from ClickHouse...');

    for (const client of this.connectionPool.clients) {
      await client.close();
    }
    this.connectionPool.clients = [];
    this.connectionPool.currentIndex = 0;

    this.logger.info('Disconnected from ClickHouse');
  }
}
