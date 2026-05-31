import { Pool, PoolClient } from 'pg'
import { config } from '../config'
import { createLogger } from '../utils/logger'
import type { DataSource, DashboardConfig, TableInfo, ShardInfo } from '../types'
import { v4 as uuidv4 } from 'uuid'

const logger = createLogger('database')

const TRANSACTION_RETRY_LIMIT = 3
const TRANSACTION_RETRY_DELAY = 1000

class DatabaseService {
  private pool: Pool | null = null
  private connected: boolean = false
  private writeConfirmationEnabled: boolean = true

  async connect(): Promise<boolean> {
    try {
      this.pool = new Pool({
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        user: config.database.user,
        password: config.database.password,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      })

      const client = await this.pool.connect()
      await client.query('SELECT NOW()')
      client.release()

      this.connected = true
      logger.info('Connected to PostgreSQL')
      return true
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL:', error)
      this.connected = false
      return false
    }
  }

  isConnected(): boolean {
    return this.connected && this.pool !== null
  }

  async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database pool not initialized')
    }

    const client: PoolClient = await this.pool.connect()
    try {
      const result = await client.query(text, params)
      return result
    } finally {
      client.release()
    }
  }

  async executeInTransaction<T>(
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    if (!this.pool) {
      throw new Error('Database pool not initialized')
    }

    const client: PoolClient = await this.pool.connect()

    try {
      await client.query('BEGIN')

      const result = await operation(client)

      await client.query('COMMIT')

      if (this.writeConfirmationEnabled) {
        await client.query('SELECT 1')
      }

      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= TRANSACTION_RETRY_LIMIT; attempt++) {
      try {
        return await operation()
      } catch (error: any) {
        lastError = error
        logger.warn(`${context} attempt ${attempt + 1}/${TRANSACTION_RETRY_LIMIT + 1} failed: ${error.message}`)

        if (attempt < TRANSACTION_RETRY_LIMIT) {
          await this.delay(TRANSACTION_RETRY_DELAY * (attempt + 1))
        }
      }
    }

    throw lastError || new Error(`${context} failed after all retries`)
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async initializeSchema(): Promise<void> {
    const createExtensions = `
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `

    const createDataSourcesTable = `
      CREATE TABLE IF NOT EXISTS data_sources (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        config JSONB DEFAULT '{}',
        connected BOOLEAN DEFAULT FALSE,
        last_sync TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `

    const createDashboardsTable = `
      CREATE TABLE IF NOT EXISTS dashboards (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        components JSONB DEFAULT '[]',
        layout VARCHAR(20) DEFAULT 'grid',
        filters JSONB DEFAULT '{}',
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `

    const createShardTables = `
      DO $$
      DECLARE
        shard_id INTEGER;
      BEGIN
        FOR shard_id IN 0..${config.tableShardCount - 1} LOOP
          EXECUTE format(
            'CREATE TABLE IF NOT EXISTS log_entries_%s (
              id VARCHAR(255) PRIMARY KEY,
              trace_id VARCHAR(255),
              span_id VARCHAR(255),
              parent_span_id VARCHAR(255),
              timestamp TIMESTAMP WITH TIME ZONE,
              level VARCHAR(10),
              service VARCHAR(255),
              node VARCHAR(255),
              os VARCHAR(20),
              message TEXT,
              stack_trace TEXT,
              metadata JSONB DEFAULT ''{}'',
              tags TEXT[] DEFAULT ''{}''
            );',
            shard_id
          );
        END LOOP;
      END
      $$;
    `

    const createIndexes = `
      DO $$
      DECLARE
        shard_id INTEGER;
      BEGIN
        FOR shard_id IN 0..${config.tableShardCount - 1} LOOP
          EXECUTE format('CREATE INDEX IF NOT EXISTS idx_log_entries_%s_trace_id ON log_entries_%s (trace_id);', shard_id, shard_id);
          EXECUTE format('CREATE INDEX IF NOT EXISTS idx_log_entries_%s_timestamp ON log_entries_%s (timestamp DESC);', shard_id, shard_id);
          EXECUTE format('CREATE INDEX IF NOT EXISTS idx_log_entries_%s_level ON log_entries_%s (level);', shard_id, shard_id);
          EXECUTE format('CREATE INDEX IF NOT EXISTS idx_log_entries_%s_service ON log_entries_%s (service);', shard_id, shard_id);
        END LOOP;
      END
      $$;
    `

    try {
      await this.executeWithRetry(async () => {
        await this.query(createExtensions)
        await this.query(createDataSourcesTable)
        await this.query(createDashboardsTable)
      }, 'initialize schema')

      await this.query(createShardTables)
      await this.query(createIndexes)
      logger.info('Database schema initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize database schema:', error)
      throw error
    }
  }

  getShardId(traceId: string): number {
    if (!traceId) return 0
    let hash = 0
    for (let i = 0; i < traceId.length; i++) {
      hash = ((hash << 5) - hash) + traceId.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash) % config.tableShardCount
  }

  getShardTableName(shardId: number): string {
    return `log_entries_${shardId}`
  }

  async getTableInfo(): Promise<TableInfo[]> {
    const tables: TableInfo[] = []

    for (let i = 0; i < config.tableShardCount; i++) {
      const tableName = this.getShardTableName(i)
      try {
        const countResult = await this.query(`SELECT count(*) as cnt FROM ${tableName}`)
        const sizeResult = await this.query(`SELECT pg_total_relation_size('${tableName}') as size`)

        tables.push({
          baseName: 'log_entries',
          shardCount: config.tableShardCount,
          shards: [],
          totalRecords: parseInt(countResult.rows[0].cnt) || 0,
          totalSizeBytes: parseInt(sizeResult.rows[0].size) || 0
        })
      } catch (error) {
        logger.warn(`Failed to get info for table ${tableName}:`, error)
      }
    }

    return tables
  }

  async getShardInfo(): Promise<ShardInfo[]> {
    const shards: ShardInfo[] = []

    for (let i = 0; i < config.tableShardCount; i++) {
      const tableName = this.getShardTableName(i)
      try {
        const countResult = await this.query(`SELECT count(*) as cnt FROM ${tableName}`)
        const sizeResult = await this.query(`SELECT pg_total_relation_size('${tableName}') as size`)

        shards.push({
          shardId: i,
          tableName,
          recordCount: parseInt(countResult.rows[0].cnt) || 0,
          sizeBytes: parseInt(sizeResult.rows[0].size) || 0
        })
      } catch (error) {
        logger.warn(`Failed to get shard info for ${tableName}:`, error)
      }
    }

    return shards
  }

  async cleanupOldData(): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - config.logRetentionDays)

    let totalDeleted = 0

    for (let i = 0; i < config.tableShardCount; i++) {
      const tableName = this.getShardTableName(i)
      try {
        const result = await this.executeInTransaction(async (client) => {
          const deleteResult = await client.query(
            `DELETE FROM ${tableName} WHERE timestamp < $1`,
            [cutoffDate]
          )
          return deleteResult.rowCount || 0
        })

        totalDeleted += result
        logger.info(`Cleaned up ${result} records from ${tableName}`)
      } catch (error) {
        logger.warn(`Failed to cleanup ${tableName}:`, error)
      }
    }

    return totalDeleted
  }

  async getDataSources(): Promise<DataSource[]> {
    try {
      const result = await this.query('SELECT * FROM data_sources ORDER BY created_at DESC')
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        config: row.config || {},
        connected: row.connected,
        lastSync: row.last_sync,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    } catch (error) {
      logger.error('Failed to get data sources:', error)
      throw error
    }
  }

  async getDataSourceById(id: string): Promise<DataSource | null> {
    try {
      const result = await this.query('SELECT * FROM data_sources WHERE id = $1', [id])
      if (result.rows.length === 0) return null

      const row = result.rows[0]
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        config: row.config || {},
        connected: row.connected,
        lastSync: row.last_sync,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    } catch (error) {
      logger.error('Failed to get data source:', error)
      throw error
    }
  }

  async createDataSource(data: Omit<DataSource, 'id' | 'createdAt' | 'updatedAt'>): Promise<DataSource> {
    return this.executeWithRetry(async () => {
      const id = uuidv4()
      const result = await this.executeInTransaction(async (client) => {
        return await client.query(
          `INSERT INTO data_sources (id, name, type, config, connected)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [id, data.name, data.type, JSON.stringify(data.config), data.connected]
        )
      })

      const row = result.rows[0]
      logger.info(`Created data source: ${id}`)
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        config: row.config || {},
        connected: row.connected,
        lastSync: row.last_sync,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }, 'create data source')
  }

  async updateDataSource(id: string, data: Partial<DataSource>): Promise<DataSource | null> {
    return this.executeWithRetry(async () => {
      const updates: string[] = []
      const values: any[] = []
      let paramIndex = 1

      if (data.name !== undefined) {
        updates.push(`name = $${paramIndex++}`)
        values.push(data.name)
      }
      if (data.type !== undefined) {
        updates.push(`type = $${paramIndex++}`)
        values.push(data.type)
      }
      if (data.config !== undefined) {
        updates.push(`config = $${paramIndex++}`)
        values.push(JSON.stringify(data.config))
      }
      if (data.connected !== undefined) {
        updates.push(`connected = $${paramIndex++}`)
        values.push(data.connected)
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`)
      values.push(id)

      const result = await this.executeInTransaction(async (client) => {
        return await client.query(
          `UPDATE data_sources SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
          values
        )
      })

      if (result.rows.length === 0) return null

      const row = result.rows[0]
      logger.info(`Updated data source: ${id}`)
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        config: row.config || {},
        connected: row.connected,
        lastSync: row.last_sync,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }, 'update data source')
  }

  async deleteDataSource(id: string): Promise<boolean> {
    return this.executeWithRetry(async () => {
      const result = await this.executeInTransaction(async (client) => {
        return await client.query('DELETE FROM data_sources WHERE id = $1', [id])
      })
      const deleted = (result.rowCount || 0) > 0
      if (deleted) {
        logger.info(`Deleted data source: ${id}`)
      }
      return deleted
    }, 'delete data source')
  }

  async getDashboards(): Promise<DashboardConfig[]> {
    try {
      const result = await this.query('SELECT * FROM dashboards ORDER BY created_at DESC')
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        components: row.components || [],
        layout: row.layout || 'grid',
        filters: row.filters || {},
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    } catch (error) {
      logger.error('Failed to get dashboards:', error)
      throw error
    }
  }

  async getDashboardById(id: string): Promise<DashboardConfig | null> {
    try {
      const result = await this.query('SELECT * FROM dashboards WHERE id = $1', [id])
      if (result.rows.length === 0) return null

      const row = result.rows[0]
      return {
        id: row.id,
        name: row.name,
        components: row.components || [],
        layout: row.layout || 'grid',
        filters: row.filters || {},
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    } catch (error) {
      logger.error('Failed to get dashboard:', error)
      throw error
    }
  }

  async createDashboard(data: Omit<DashboardConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<DashboardConfig> {
    return this.executeWithRetry(async () => {
      const id = uuidv4()
      const result = await this.executeInTransaction(async (client) => {
        return await client.query(
          `INSERT INTO dashboards (id, name, components, layout, filters, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [id, data.name, JSON.stringify(data.components), data.layout, JSON.stringify(data.filters), data.createdBy]
        )
      })

      const row = result.rows[0]
      logger.info(`Created dashboard: ${id}`)
      return {
        id: row.id,
        name: row.name,
        components: row.components || [],
        layout: row.layout || 'grid',
        filters: row.filters || {},
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }, 'create dashboard')
  }

  async updateDashboard(id: string, data: Partial<DashboardConfig>): Promise<DashboardConfig | null> {
    return this.executeWithRetry(async () => {
      const updates: string[] = []
      const values: any[] = []
      let paramIndex = 1

      if (data.name !== undefined) {
        updates.push(`name = $${paramIndex++}`)
        values.push(data.name)
      }
      if (data.components !== undefined) {
        updates.push(`components = $${paramIndex++}`)
        values.push(JSON.stringify(data.components))
      }
      if (data.layout !== undefined) {
        updates.push(`layout = $${paramIndex++}`)
        values.push(data.layout)
      }
      if (data.filters !== undefined) {
        updates.push(`filters = $${paramIndex++}`)
        values.push(JSON.stringify(data.filters))
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`)
      values.push(id)

      const result = await this.executeInTransaction(async (client) => {
        return await client.query(
          `UPDATE dashboards SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
          values
        )
      })

      if (result.rows.length === 0) return null

      const row = result.rows[0]
      logger.info(`Updated dashboard: ${id}`)
      return {
        id: row.id,
        name: row.name,
        components: row.components || [],
        layout: row.layout || 'grid',
        filters: row.filters || {},
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }, 'update dashboard')
  }

  async deleteDashboard(id: string): Promise<boolean> {
    return this.executeWithRetry(async () => {
      const result = await this.executeInTransaction(async (client) => {
        return await client.query('DELETE FROM dashboards WHERE id = $1', [id])
      })
      const deleted = (result.rowCount || 0) > 0
      if (deleted) {
        logger.info(`Deleted dashboard: ${id}`)
      }
      return deleted
    }, 'delete dashboard')
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.connected = false
      logger.info('Disconnected from PostgreSQL')
    }
  }
}

export const databaseService = new DatabaseService()
export default databaseService