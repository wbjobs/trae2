const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

class BatchWriter {
  constructor(mysqlPool, redisClient, options = {}) {
    this.mysqlPool = mysqlPool;
    this.redisClient = redisClient;
    this.options = {
      maxBatchSize: options.maxBatchSize || 1000,
      maxBatchInterval: options.maxBatchInterval || 1000,
      useLoadData: options.useLoadData !== false,
      useTransaction: options.useTransaction !== false,
      tempDir: options.tempDir || os.tmpdir(),
      metricsRetention: options.metricsRetention || 1000,
      ...options
    };

    this.metricsBuffer = [];
    this.nodesBuffer = new Map();
    this.flushTimer = null;
    this.isFlushing = false;
    this.performanceStats = [];

    this.redisPipelineSize = 100;
    this.redisonKeyPrefix = 'node:';
    this.redisonKeyTTL = 120;

    this.startAutoFlush();
  }

  startAutoFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.options.maxBatchInterval);
  }

  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async queueHeartbeat(heartbeat, skipPersist = false) {
    this.metricsBuffer.push(heartbeat);
    this.nodesBuffer.set(heartbeat.nodeId, heartbeat);

    if (!skipPersist && this.metricsBuffer.length >= this.options.maxBatchSize) {
      await this.flush();
    }
  }

  async queueHeartbeats(heartbeats) {
    for (const hb of heartbeats) {
      this.metricsBuffer.push(hb);
      this.nodesBuffer.set(hb.nodeId, hb);
    }

    if (this.metricsBuffer.length >= this.options.maxBatchSize) {
      await this.flush();
    }
  }

  async flush() {
    if (this.isFlushing) return;
    if (this.metricsBuffer.length === 0 && this.nodesBuffer.size === 0) return;

    this.isFlushing = true;
    const startTime = Date.now();

    try {
      const metricsBatch = this.metricsBuffer.splice(0);
      const nodesBatch = Array.from(this.nodesBuffer.values());
      this.nodesBuffer.clear();

      if (metricsBatch.length > 0) {
        await this.flushRedis(metricsBatch);
        const result = await this.flushMetrics(metricsBatch);
        await this.flushNodes(nodesBatch);
        this.recordPerformance('batch_flush', metricsBatch.length, Date.now() - startTime, result);
      }

    } catch (error) {
      console.error('批量写入失败:', error);
      this.recordPerformance('batch_flush', 0, Date.now() - startTime, { failed: this.metricsBuffer.length });
      throw error;
    } finally {
      this.isFlushing = false;
    }
  }

  async flushRedis(heartbeats) {
    const startTime = Date.now();
    const pipeline = this.redisClient.multi();

    for (const hb of heartbeats) {
      const cacheKey = `${this.redisonKeyPrefix}${hb.nodeId}:status`;
      const value = JSON.stringify({
        nodeId: hb.nodeId,
        groupId: hb.groupId,
        region: hb.region,
        cpu: hb.cpu,
        memory: hb.memory,
        bandwidth: hb.bandwidth,
        uptime: hb.uptime,
        status: hb.status,
        lastUpdate: new Date()
      });
      pipeline.setEx(cacheKey, this.redisonKeyTTL, value);
      pipeline.zIncrBy('hot:nodes', 1, hb.nodeId);
    }

    try {
      await pipeline.exec();
      this.recordPerformance('redis_pipeline', heartbeats.length, Date.now() - startTime, { success: heartbeats.length });
    } catch (error) {
      console.error('Redis pipeline写入失败，降级为单条写入:', error.message);
      let success = 0, failed = 0;
      for (const hb of heartbeats) {
        try {
          const cacheKey = `${this.redisonKeyPrefix}${hb.nodeId}:status`;
          await this.redisClient.setEx(cacheKey, this.redisonKeyTTL, JSON.stringify({
            nodeId: hb.nodeId, groupId: hb.groupId, region: hb.region,
            cpu: hb.cpu, memory: hb.memory, bandwidth: hb.bandwidth,
            uptime: hb.uptime, status: hb.status, lastUpdate: new Date()
          }));
          await this.redisClient.zIncrBy('hot:nodes', 1, hb.nodeId);
          success++;
        } catch (e) {
          failed++;
        }
      }
      this.recordPerformance('redis_fallback', heartbeats.length, Date.now() - startTime, { success, failed });
    }
  }

  async flushMetrics(heartbeats) {
    const timestamp = new Date();
    const result = { success: 0, failed: 0, method: 'unknown' };

    if (this.options.useLoadData && heartbeats.length >= 100) {
      try {
        const loadDataResult = await this.flushMetricsWithLoadData(heartbeats, timestamp);
        result.success = loadDataResult.affectedRows || heartbeats.length;
        result.method = 'load_data';
      } catch (error) {
        console.warn('LOAD DATA失败，降级为批量INSERT:', error.message);
        const insertResult = await this.flushMetricsWithBatchInsert(heartbeats, timestamp);
        result.success = insertResult.affectedRows || 0;
        result.method = 'batch_insert';
      }
    } else if (this.options.useTransaction && heartbeats.length >= 50) {
      try {
        const txResult = await this.flushMetricsWithTransaction(heartbeats, timestamp);
        result.success = txResult.success;
        result.failed = txResult.failed;
        result.method = 'transaction';
      } catch (error) {
        console.warn('事务写入失败，降级为普通批量INSERT:', error.message);
        const insertResult = await this.flushMetricsWithBatchInsert(heartbeats, timestamp);
        result.success = insertResult.affectedRows || 0;
        result.method = 'batch_insert';
      }
    } else {
      const insertResult = await this.flushMetricsWithBatchInsert(heartbeats, timestamp);
      result.success = insertResult.affectedRows || 0;
      result.method = 'batch_insert';
    }

    return result;
  }

  async flushMetricsWithLoadData(heartbeats, timestamp) {
    const tempFile = path.join(
      this.options.tempDir,
      `metrics_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.csv`
    );

    try {
      const lines = heartbeats.map(hb => {
        const escapedNodeId = this.escapeCsvField(hb.nodeId);
        const escapedGroupId = this.escapeCsvField(hb.groupId);
        const escapedRegion = this.escapeCsvField(hb.region);
        const escapedStatus = this.escapeCsvField(hb.status);
        return `${escapedNodeId},${escapedGroupId},${escapedRegion},${hb.cpu},${hb.memory},${hb.bandwidth},${hb.uptime},${escapedStatus},${this.formatDateTime(timestamp)}`;
      });

      fs.writeFileSync(tempFile, lines.join('\n'), 'utf-8');

      const startTime = Date.now();
      const [result] = await this.mysqlPool.query(
        `LOAD DATA LOCAL INFILE ? 
         INTO TABLE node_metrics 
         FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
         (node_id, group_id, region, cpu_usage, memory_usage, bandwidth_usage, uptime, status, timestamp)`,
        [tempFile]
      );

      this.recordPerformance('load_data', heartbeats.length, Date.now() - startTime, { success: result.affectedRows });
      return result;
    } finally {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (e) {}
    }
  }

  async flushMetricsWithBatchInsert(heartbeats, timestamp) {
    const startTime = Date.now();
    const values = heartbeats.map(hb => [
      hb.nodeId, hb.groupId, hb.region, hb.cpu, hb.memory, hb.bandwidth, hb.uptime, hb.status, timestamp
    ]);

    const [result] = await this.mysqlPool.query(
      `INSERT INTO node_metrics (node_id, group_id, region, cpu_usage, memory_usage, bandwidth_usage, uptime, status, timestamp)
       VALUES ?`,
      [values]
    );

    this.recordPerformance('batch_insert', heartbeats.length, Date.now() - startTime, { success: result.affectedRows });
    return result;
  }

  async flushMetricsWithTransaction(heartbeats, timestamp) {
    const startTime = Date.now();
    const conn = await this.mysqlPool.getConnection();

    try {
      await conn.beginTransaction();

      let success = 0;
      let failed = 0;
      const batchSize = 100;

      for (let i = 0; i < heartbeats.length; i += batchSize) {
        const batch = heartbeats.slice(i, i + batchSize);
        const values = batch.map(hb => [
          hb.nodeId, hb.groupId, hb.region, hb.cpu, hb.memory, hb.bandwidth, hb.uptime, hb.status, timestamp
        ]);

        try {
          await conn.query(
            `INSERT INTO node_metrics (node_id, group_id, region, cpu_usage, memory_usage, bandwidth_usage, uptime, status, timestamp)
             VALUES ?`,
            [values]
          );
          success += batch.length;
        } catch (e) {
          failed += batch.length;
        }
      }

      await conn.commit();
      this.recordPerformance('transaction', heartbeats.length, Date.now() - startTime, { success, failed });
      return { success, failed };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async flushNodes(nodes) {
    if (nodes.length === 0) return;

    const startTime = Date.now();
    const timestamp = new Date();

    const caseStatements = nodes.map(() => 'WHEN ? THEN ?').join(' ');
    const nodeIds = nodes.map(n => n.nodeId);
    const statusValues = nodes.flatMap(n => [n.nodeId, n.status]);
    const updateValues = [...statusValues, timestamp, ...nodeIds];

    const query = `
      INSERT INTO nodes (node_id, group_id, region, last_status, last_update)
      VALUES ${nodes.map(() => '(?, ?, ?, ?, ?)').join(', ')}
      ON DUPLICATE KEY UPDATE
        group_id = VALUES(group_id),
        region = VALUES(region),
        last_status = VALUES(last_status),
        last_update = VALUES(last_update)
    `;

    const params = nodes.flatMap(n => [n.nodeId, n.groupId, n.region, n.status, timestamp]);

    try {
      const [result] = await this.mysqlPool.execute(query, params);
      this.recordPerformance('nodes_upsert', nodes.length, Date.now() - startTime, { 
        success: result.affectedRows,
        changed: result.changedRows 
      });
      return result;
    } catch (error) {
      console.error('节点批量UPSERT失败，降级为单条执行:', error.message);
      let success = 0;
      for (const node of nodes) {
        try {
          await this.mysqlPool.execute(
            `INSERT INTO nodes (node_id, group_id, region, last_status, last_update)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE last_status = ?, last_update = ?`,
            [node.nodeId, node.groupId, node.region, node.status, timestamp, node.status, timestamp]
          );
          success++;
        } catch (e) {}
      }
      this.recordPerformance('nodes_fallback', nodes.length, Date.now() - startTime, { success });
      return { success };
    }
  }

  escapeCsvField(field) {
    if (typeof field !== 'string') {
      field = String(field);
    }
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  formatDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  recordPerformance(operationType, batchSize, durationMs, result = {}) {
    const stat = {
      operationType,
      batchSize,
      durationMs,
      recordsProcessed: batchSize,
      successCount: result.success || 0,
      failedCount: result.failed || 0,
      method: result.method || operationType,
      createdAt: new Date()
    };

    this.performanceStats.push(stat);
    if (this.performanceStats.length > this.options.metricsRetention) {
      this.performanceStats.shift();
    }

    this.persistPerformanceStat(stat).catch(e => {});
  }

  async persistPerformanceStat(stat) {
    try {
      await this.mysqlPool.execute(
        `INSERT INTO write_performance_stats 
         (operation_type, batch_size, duration_ms, records_processed, success_count, failed_count, method)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [stat.operationType, stat.batchSize, stat.durationMs, stat.recordsProcessed, 
         stat.successCount, stat.failedCount, stat.method]
      );
    } catch (e) {}
  }

  getPerformanceStats(hours = 1) {
    const cutoff = Date.now() - hours * 3600 * 1000;
    const stats = this.performanceStats.filter(s => new Date(s.createdAt).getTime() > cutoff);
    
    const grouped = {};
    stats.forEach(s => {
      if (!grouped[s.operationType]) {
        grouped[s.operationType] = {
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          totalRecords: 0,
          successRate: 0,
          samples: []
        };
      }
      const g = grouped[s.operationType];
      g.count++;
      g.totalDuration += s.durationMs;
      g.totalRecords += s.recordsProcessed;
      g.successRate += s.successCount / Math.max(s.recordsProcessed, 1);
      if (g.samples.length < 100) {
        g.samples.push(s);
      }
    });

    for (const key in grouped) {
      const g = grouped[key];
      g.avgDuration = (g.totalDuration / g.count).toFixed(2);
      g.successRate = ((g.successRate / g.count) * 100).toFixed(2) + '%';
      g.throughput = g.count > 0 ? (g.totalRecords / (g.totalDuration / 1000)).toFixed(2) + '/s' : '0/s';
      delete g.samples;
    }

    return {
      summary: grouped,
      recent: stats.slice(-50)
    };
  }

  async getHistoricalPerformanceStats(hours = 24) {
    const [rows] = await this.mysqlPool.execute(
      `SELECT operation_type, method, 
              COUNT(*) as count, 
              AVG(duration_ms) as avg_duration_ms,
              AVG(batch_size) as avg_batch_size,
              SUM(success_count) as total_success,
              SUM(failed_count) as total_failed
       FROM write_performance_stats 
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
       GROUP BY operation_type, method
       ORDER BY operation_type, avg_duration_ms`,
      [hours]
    );

    return rows.map(row => ({
      operationType: row.operation_type,
      method: row.method,
      count: row.count,
      avgDurationMs: parseFloat(row.avg_duration_ms.toFixed(2)),
      avgBatchSize: parseFloat(row.avg_batch_size.toFixed(2)),
      totalSuccess: row.total_success,
      totalFailed: row.total_failed,
      successRate: row.total_success + row.total_failed > 0
        ? ((row.total_success / (row.total_success + row.total_failed)) * 100).toFixed(2) + '%'
        : '100%'
    }));
  }

  getBufferStatus() {
    return {
      metricsBufferSize: this.metricsBuffer.length,
      nodesBufferSize: this.nodesBuffer.size,
      maxBatchSize: this.options.maxBatchSize,
      isFlushing: this.isFlushing,
      performanceStatsCount: this.performanceStats.length
    };
  }

  async forceFlush() {
    await this.flush();
    return this.getBufferStatus();
  }

  async destroy() {
    this.stopAutoFlush();
    await this.flush();
  }
}

module.exports = BatchWriter;
