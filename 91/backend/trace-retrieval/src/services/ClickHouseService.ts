import { createClient, ClickHouseClient } from '@clickhouse/client';
import winston from 'winston';
import {
    DATABASE_NAME,
    TABLE_NAME,
    CREATE_DATABASE_DDL,
    SIGNALING_TABLE_DDL,
    SignalingMessage,
    QueryFilters,
    QueryOptions,
    MetricsData,
    DeviceStats,
    TypeDistribution
} from '../models/SignalingTable';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

export class ClickHouseService {
    private client: ClickHouseClient;
    private static instance: ClickHouseService;

    private constructor() {
        this.client = createClient({
            host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
            username: process.env.CLICKHOUSE_USER || 'default',
            password: process.env.CLICKHOUSE_PASSWORD || '',
            database: DATABASE_NAME
        });
    }

    public static getInstance(): ClickHouseService {
        if (!ClickHouseService.instance) {
            ClickHouseService.instance = new ClickHouseService();
        }
        return ClickHouseService.instance;
    }

    public async initDatabase(): Promise<void> {
        try {
            logger.info('Initializing ClickHouse database...');
            await this.client.exec({ query: CREATE_DATABASE_DDL });
            logger.info(`Database ${DATABASE_NAME} created or already exists`);
            await this.client.exec({ query: SIGNALING_TABLE_DDL });
            logger.info(`Table ${TABLE_NAME} created or already exists`);
        } catch (error) {
            logger.error('Failed to initialize database:', error);
            throw error;
        }
    }

    private buildWhereClause(filters: QueryFilters, startTime?: string, endTime?: string): string {
        const conditions: string[] = [];

        if (startTime) {
            conditions.push(`timestamp >= '${startTime}'`);
        }
        if (endTime) {
            conditions.push(`timestamp <= '${endTime}'`);
        }
        if (filters.deviceId) {
            conditions.push(`device_id = '${filters.deviceId}'`);
        }
        if (filters.deviceName) {
            conditions.push(`device_name = '${filters.deviceName}'`);
        }
        if (filters.signalingType) {
            if (Array.isArray(filters.signalingType)) {
                const types = filters.signalingType.map(t => `'${t}'`).join(', ');
                conditions.push(`signaling_type IN (${types})`);
            } else {
                conditions.push(`signaling_type = '${filters.signalingType}'`);
            }
        }
        if (filters.protocol) {
            conditions.push(`protocol = '${filters.protocol}'`);
        }
        if (filters.sourceIp) {
            conditions.push(`source_ip = '${filters.sourceIp}'`);
        }
        if (filters.destIp) {
            conditions.push(`dest_ip = '${filters.destIp}'`);
        }
        if (filters.status) {
            conditions.push(`status = '${filters.status}'`);
        }
        if (filters.minLength !== undefined) {
            conditions.push(`length >= ${filters.minLength}`);
        }
        if (filters.maxLength !== undefined) {
            conditions.push(`length <= ${filters.maxLength}`);
        }

        return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    }

    private buildOrderAndLimit(options: QueryOptions): string {
        let clause = '';
        if (options.orderBy) {
            const direction = options.orderDirection || 'DESC';
            clause += ` ORDER BY ${options.orderBy} ${direction}`;
        } else {
            clause += ` ORDER BY timestamp DESC`;
        }
        if (options.limit !== undefined) {
            clause += ` LIMIT ${options.limit}`;
        }
        if (options.offset !== undefined) {
            clause += ` OFFSET ${options.offset}`;
        }
        return clause;
    }

    public async queryByDevice(
        deviceId: string,
        startTime: string,
        endTime: string,
        options: QueryOptions = {}
    ): Promise<SignalingMessage[]> {
        const whereClause = this.buildWhereClause({ deviceId }, startTime, endTime);
        const orderLimit = this.buildOrderAndLimit(options);
        const query = `
            SELECT * FROM ${DATABASE_NAME}.${TABLE_NAME}
            ${whereClause}
            ${orderLimit}
        `;

        const result = await this.client.query({ query });
        const rows = await result.json();
        return rows.data as SignalingMessage[];
    }

    public async queryByTimeRange(
        startTime: string,
        endTime: string,
        filters: QueryFilters = {},
        options: QueryOptions = {}
    ): Promise<SignalingMessage[]> {
        const whereClause = this.buildWhereClause(filters, startTime, endTime);
        const orderLimit = this.buildOrderAndLimit(options);
        const query = `
            SELECT * FROM ${DATABASE_NAME}.${TABLE_NAME}
            ${whereClause}
            ${orderLimit}
        `;

        const result = await this.client.query({ query });
        const rows = await result.json();
        return rows.data as SignalingMessage[];
    }

    public async queryBySignalingType(
        types: string | string[],
        startTime: string,
        endTime: string,
        options: QueryOptions = {}
    ): Promise<SignalingMessage[]> {
        const whereClause = this.buildWhereClause({ signalingType: types }, startTime, endTime);
        const orderLimit = this.buildOrderAndLimit(options);
        const query = `
            SELECT * FROM ${DATABASE_NAME}.${TABLE_NAME}
            ${whereClause}
            ${orderLimit}
        `;

        const result = await this.client.query({ query });
        const rows = await result.json();
        return rows.data as SignalingMessage[];
    }

    public async querySignalingTrace(signalingId: string): Promise<SignalingMessage[]> {
        const query = `
            SELECT * FROM ${DATABASE_NAME}.${TABLE_NAME}
            WHERE id = '${signalingId}'
            ORDER BY timestamp ASC
        `;

        const result = await this.client.query({ query });
        const rows = await result.json();
        return rows.data as SignalingMessage[];
    }

    public async getMetrics(
        interval: string = '1m',
        startTime?: string,
        endTime?: string
    ): Promise<MetricsData[]> {
        const whereClause = this.buildWhereClause({}, startTime, endTime);
        const query = `
            SELECT
                toStartOfInterval(timestamp, INTERVAL ${interval}) as timestamp,
                signaling_type,
                count() as count
            FROM ${DATABASE_NAME}.${TABLE_NAME}
            ${whereClause}
            GROUP BY timestamp, signaling_type
            ORDER BY timestamp ASC, signaling_type ASC
        `;

        const result = await this.client.query({ query });
        const rows = await result.json();
        return rows.data as MetricsData[];
    }

    public async searchPayload(
        keyword: string,
        filters: QueryFilters = {},
        options: QueryOptions = {}
    ): Promise<SignalingMessage[]> {
        const whereClause = this.buildWhereClause(filters);
        const searchCondition = whereClause ? ` AND ` : 'WHERE ';
        const orderLimit = this.buildOrderAndLimit(options);
        const query = `
            SELECT * FROM ${DATABASE_NAME}.${TABLE_NAME}
            ${whereClause}
            ${searchCondition} position(payload, '${keyword}') > 0
            ${orderLimit}
        `;

        const result = await this.client.query({ query });
        const rows = await result.json();
        return rows.data as SignalingMessage[];
    }

    public async getRealtimeMetrics(): Promise<{
        total: number;
        byType: MetricsData[];
        byDevice: MetricsData[];
    }> {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const whereClause = `WHERE timestamp >= '${fiveMinutesAgo}'`;

        const totalQuery = `
            SELECT count() as total
            FROM ${DATABASE_NAME}.${TABLE_NAME}
            ${whereClause}
        `;

        const typeQuery = `
            SELECT
                signaling_type,
                count() as count
            FROM ${DATABASE_NAME}.${TABLE_NAME}
            ${whereClause}
            GROUP BY signaling_type
            ORDER BY count DESC
        `;

        const deviceQuery = `
            SELECT
                device_id,
                count() as count
            FROM ${DATABASE_NAME}.${TABLE_NAME}
            ${whereClause}
            GROUP BY device_id
            ORDER BY count DESC
            LIMIT 10
        `;

        const [totalResult, typeResult, deviceResult] = await Promise.all([
            this.client.query({ query: totalQuery }),
            this.client.query({ query: typeQuery }),
            this.client.query({ query: deviceQuery })
        ]);

        const totalRows = await totalResult.json();
        const typeRows = await typeResult.json();
        const deviceRows = await deviceResult.json();

        return {
            total: totalRows.data[0]?.total || 0,
            byType: typeRows.data as MetricsData[],
            byDevice: deviceRows.data as MetricsData[]
        };
    }

    public async getDevices(): Promise<DeviceStats[]> {
        const query = `
            SELECT
                device_id,
                any(device_name) as device_name,
                count() as message_count,
                max(timestamp) as last_seen
            FROM ${DATABASE_NAME}.${TABLE_NAME}
            GROUP BY device_id
            ORDER BY message_count DESC
        `;

        const result = await this.client.query({ query });
        const rows = await result.json();
        return rows.data as DeviceStats[];
    }

    public async getTypeDistribution(): Promise<TypeDistribution[]> {
        const query = `
            SELECT
                signaling_type,
                count() as count,
                round(count() * 100 / (SELECT count() FROM ${DATABASE_NAME}.${TABLE_NAME}), 2) as percentage
            FROM ${DATABASE_NAME}.${TABLE_NAME}
            GROUP BY signaling_type
            ORDER BY count DESC
        `;

        const result = await this.client.query({ query });
        const rows = await result.json();
        return rows.data as TypeDistribution[];
    }

    public async getSignalingById(id: string): Promise<SignalingMessage | null> {
        const query = `
            SELECT * FROM ${DATABASE_NAME}.${TABLE_NAME}
            WHERE id = '${id}'
            LIMIT 1
        `;

        const result = await this.client.query({ query });
        const rows = await result.json();
        return rows.data[0] as SignalingMessage || null;
    }

    public async healthCheck(): Promise<boolean> {
        try {
            const result = await this.client.query({ query: 'SELECT 1' });
            await result.json();
            return true;
        } catch (error) {
            logger.error('ClickHouse health check failed:', error);
            return false;
        }
    }
}

export default ClickHouseService;
