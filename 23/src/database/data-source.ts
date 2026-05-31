import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '../config/environment';
import { Terminal } from './models/Terminal';
import { TerminalDataRecord } from './models/TerminalDataRecord';
import { AlarmEventEntity } from './models/AlarmEvent';
import { ThresholdRuleEntity } from './models/ThresholdRule';
import logger from '../utils/logger';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: config.mysql.host,
  port: config.mysql.port,
  username: config.mysql.username,
  password: config.mysql.password,
  database: config.mysql.database,
  synchronize: config.server.nodeEnv === 'development',
  logging: config.server.nodeEnv === 'development',
  entities: [Terminal, TerminalDataRecord, AlarmEventEntity, ThresholdRuleEntity],
  migrations: [],
  subscribers: [],
  extra: {
    connectionLimit: 100,
    acquireTimeout: 60000,
    timeout: 60000,
    waitForConnections: true,
    queueLimit: 0,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    maxUses: 7500,
  },
  cache: {
    duration: 10000,
    type: 'database',
    options: {
      max_size: 1000,
      ttl: 30000,
    },
  },
});

let connectionPromise: Promise<void> | null = null;

export async function initializeDatabase(): Promise<void> {
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async (): Promise<void> => {
    try {
      await AppDataSource.initialize();
      logger.info('Database connection established successfully');

      const queryRunner = AppDataSource.createQueryRunner();
      try {
        await queryRunner.query(
          'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED'
        );
        await queryRunner.query(
          "SET SESSION innodb_lock_wait_timeout = 5"
        );
        await queryRunner.query(
          "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'"
        );
      } finally {
        await queryRunner.release();
      }

      logger.info('Database session configuration applied');
    } catch (err) {
      logger.error('Failed to initialize database:', err);
      connectionPromise = null;
      throw err;
    }
  })();

  return connectionPromise;
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('Database connection closed');
  }
}

export function getDatabasePoolStats(): {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
} {
  const pool = (AppDataSource.driver as unknown as {
    master?: {
      pool?: {
        totalCount?: () => number;
        activeCount?: () => number;
        idleCount?: () => number;
        waitingCount?: () => number;
      };
    };
  }).master?.pool;

  if (!pool) {
    return {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
    };
  }

  return {
    totalConnections: pool.totalCount?.() || 0,
    activeConnections: pool.activeCount?.() || 0,
    idleConnections: pool.idleCount?.() || 0,
    waitingRequests: pool.waitingCount?.() || 0,
  };
}
