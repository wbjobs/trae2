const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const config = require('../config');
const logger = require('../utils/logger');

const influxDB = new InfluxDB({
  url: config.influxdb.url,
  token: config.influxdb.token,
  timeout: 30000
});

const writeApi = influxDB.getWriteApi(config.influxdb.org, config.influxdb.bucket, 'ns', {
  batchSize: config.influxdb.batchSize,
  flushInterval: config.influxdb.flushInterval,
  maxBufferLines: config.influxdb.maxBufferLines,
  maxRetries: config.influxdb.retryAttempts,
  retryDelay: config.influxdb.retryDelay
});

writeApi.useDefaultTags({
  service: 'industrial-device-api'
});

const queryApi = influxDB.getQueryApi(config.influxdb.org);

const writeBuffer = {
  points: [],
  flushTimer: null,
  isFlushing: false,

  addPoint(point) {
    this.points.push(point);
    if (this.points.length >= config.influxdb.batchSize) {
      this.flush();
    }
  },

  async flush() {
    if (this.isFlushing || this.points.length === 0) {
      return;
    }

    this.isFlushing = true;
    const pointsToWrite = this.points.splice(0, this.points.length);

    try {
      let retryCount = 0;
      const maxRetries = config.influxdb.retryAttempts;

      while (retryCount < maxRetries) {
        try {
          writeApi.writePoints(pointsToWrite);
          await writeApi.flush();
          logger.debug(`批量写入成功: ${pointsToWrite.length} 条`);
          break;
        } catch (writeError) {
          retryCount++;
          if (retryCount < maxRetries) {
            const delay = config.influxdb.retryDelay * retryCount;
            logger.warn(`写入失败，第${retryCount}次重试，延迟${delay}ms: ${writeError.message}`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            logger.error(`写入最终失败，已重试${maxRetries}次: ${writeError.message}`);
            throw writeError;
          }
        }
      }
    } catch (error) {
      logger.error(`数据批量写入失败: ${error.message}`, { pointsCount: pointsToWrite.length });
      throw error;
    } finally {
      this.isFlushing = false;
    }
  },

  startAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flush();
    }, config.influxdb.flushInterval);
  },

  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
};

writeBuffer.startAutoFlush();

const databaseService = {
  convertToPoints(data) {
    const points = [];
    const deviceId = data.deviceId;
    const protocol = data.protocol || 'Custom';
    const baseTimestamp = this.parseTimestamp(data.timestamp);

    for (const point of data.points) {
      const influxPoint = new Point('device_data')
        .tag('deviceId', deviceId)
        .tag('tagId', point.tagId)
        .tag('protocol', protocol)
        .tag('quality', point.quality ? point.quality.toString() : '192');

      const timestamp = point.timestamp
        ? this.parseTimestamp(point.timestamp)
        : baseTimestamp;

      influxPoint.timestamp(timestamp);

      if (typeof point.value === 'number') {
        influxPoint.floatField('value', point.value);
      } else if (typeof point.value === 'boolean') {
        influxPoint.booleanField('value', point.value);
      } else {
        influxPoint.stringField('value', String(point.value));
      }

      if (point.quality !== undefined) {
        influxPoint.intField('quality', point.quality);
      }

      points.push(influxPoint);
    }

    if (data.metadata) {
      const metadataPoint = new Point('device_metadata')
        .tag('deviceId', deviceId)
        .tag('protocol', protocol)
        .timestamp(baseTimestamp);

      for (const [key, value] of Object.entries(data.metadata)) {
        if (typeof value === 'number') {
          metadataPoint.floatField(key, value);
        } else if (typeof value === 'boolean') {
          metadataPoint.booleanField(key, value);
        } else {
          metadataPoint.stringField(key, String(value));
        }
      }
      points.push(metadataPoint);
    }

    return points;
  },

  async writePointData(data) {
    try {
      const points = this.convertToPoints(data);

      for (const point of points) {
        writeBuffer.addPoint(point);
      }

      if (writeBuffer.points.length >= config.influxdb.batchSize * 0.8) {
        await writeBuffer.flush();
      }

      logger.debug(`数据已加入写入缓冲区: 设备=${data.deviceId}, 点位数量=${data.points.length}`);
      return { success: true, pointsWritten: data.points.length, buffered: true };
    } catch (error) {
      logger.error(`数据加入缓冲区失败: ${error.message}`);
      throw error;
    }
  },

  async writePointDataImmediate(data) {
    try {
      const points = this.convertToPoints(data);
      writeApi.writePoints(points);
      await writeApi.flush();

      logger.debug(`数据直接写入成功: 设备=${data.deviceId}, 点位数量=${data.points.length}`);
      return { success: true, pointsWritten: data.points.length };
    } catch (error) {
      logger.error(`数据直接写入失败: ${error.message}`);
      throw error;
    }
  },

  async writeBatchData(dataArray) {
    try {
      const allPoints = [];

      for (const data of dataArray) {
        const points = this.convertToPoints(data);
        allPoints.push(...points);
      }

      for (const point of allPoints) {
        writeBuffer.addPoint(point);
      }

      await writeBuffer.flush();

      const totalPoints = dataArray.reduce((sum, d) => sum + d.points.length, 0);
      logger.debug(`批量数据已加入缓冲区并写入: 总点位数=${totalPoints}`);
      return { success: true, pointsWritten: totalPoints };
    } catch (error) {
      logger.error(`批量数据写入失败: ${error.message}`);
      throw error;
    }
  },

  async flushBuffer() {
    await writeBuffer.flush();
  },

  async queryData(options = {}) {
    try {
      const {
        deviceId,
        tagId,
        start,
        end,
        limit = 1000,
        aggregation = 'none',
        window
      } = options;

      let fluxQuery = `from(bucket: "${config.influxdb.bucket}")`;

      const startTime = start ? this.parseTimestamp(start) : Date.now() - 3600000;
      const endTime = end ? this.parseTimestamp(end) : Date.now();

      fluxQuery += `
  |> range(start: ${startTime}, stop: ${endTime})
  |> filter(fn: (r) => r._measurement == "device_data")`;

      if (deviceId) {
        fluxQuery += `
  |> filter(fn: (r) => r.deviceId == "${deviceId}")`;
      }

      if (tagId) {
        fluxQuery += `
  |> filter(fn: (r) => r.tagId == "${tagId}")`;
      }

      if (aggregation !== 'none' && window) {
        const windowMs = this.parseWindowToMs(window);
        fluxQuery += `
  |> aggregateWindow(every: ${windowMs}ms, fn: ${aggregation}, createEmpty: false)`;
      }

      fluxQuery += `
  |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "deviceId", "tagId", "value", "quality"])
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: ${limit})`;

      const result = await queryApi.collectRows(fluxQuery);
      return result.map(row => ({
        timestamp: row._time,
        deviceId: row.deviceId,
        tagId: row.tagId,
        value: row.value,
        quality: row.quality
      }));
    } catch (error) {
      logger.error(`数据查询失败: ${error.message}`);
      throw error;
    }
  },

  async getLatestData(deviceId, tagId) {
    try {
      const fluxQuery = `from(bucket: "${config.influxdb.bucket}")
  |> range(start: 0)
  |> filter(fn: (r) => r._measurement == "device_data")
  |> filter(fn: (r) => r.deviceId == "${deviceId}")
  |> filter(fn: (r) => r.tagId == "${tagId}")
  |> last()
  |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")`;

      const result = await queryApi.collectRows(fluxQuery);
      if (result.length === 0) return null;

      return {
        timestamp: result[0]._time,
        deviceId: result[0].deviceId,
        tagId: result[0].tagId,
        value: result[0].value,
        quality: result[0].quality
      };
    } catch (error) {
      logger.error(`获取最新数据失败: ${error.message}`);
      throw error;
    }
  },

  async getDeviceList() {
    try {
      const fluxQuery = `import "influxdata/influxdb/v1"
v1.tagValues(
  bucket: "${config.influxdb.bucket}",
  tag: "deviceId",
  predicate: (r) => r._measurement == "device_data",
  start: 0
)`;

      const result = await queryApi.collectRows(fluxQuery);
      return result.map(row => row._value);
    } catch (error) {
      logger.error(`获取设备列表失败: ${error.message}`);
      throw error;
    }
  },

  async getTagList(deviceId) {
    try {
      let fluxQuery = `import "influxdata/influxdb/v1"
v1.tagValues(
  bucket: "${config.influxdb.bucket}",
  tag: "tagId",
  predicate: (r) => r._measurement == "device_data"`;

      if (deviceId) {
        fluxQuery += ` and r.deviceId == "${deviceId}"`;
      }

      fluxQuery += `,
  start: 0
)`;

      const result = await queryApi.collectRows(fluxQuery);
      return result.map(row => row._value);
    } catch (error) {
      logger.error(`获取标签列表失败: ${error.message}`);
      throw error;
    }
  },

  async getWriteStats() {
    return {
      bufferSize: writeBuffer.points.length,
      isFlushing: writeBuffer.isFlushing,
      batchSize: config.influxdb.batchSize,
      flushInterval: config.influxdb.flushInterval
    };
  },

  parseTimestamp(value) {
    if (typeof value === 'number') {
      if (value < 10000000000) {
        return value * 1000000000;
      }
      return value * 1000000;
    }
    if (typeof value === 'string') {
      return new Date(value).getTime() * 1000000;
    }
    if (value instanceof Date) {
      return value.getTime() * 1000000;
    }
    return Date.now() * 1000000;
  },

  parseWindowToMs(window) {
    const match = window.match(/^(\d+)([smhdw])$/);
    if (!match) return 60000;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers = {
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000,
      w: 604800000
    };

    return value * (multipliers[unit] || 60000);
  },

  async close() {
    writeBuffer.stopAutoFlush();
    await writeBuffer.flush();
    await writeApi.close();
    logger.info('InfluxDB连接已关闭');
  }
};

module.exports = databaseService;
