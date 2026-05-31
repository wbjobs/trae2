const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { config } = require('../config');
const logger = require('../utils/logger');

class InfluxDBService {
  constructor() {
    this.client = null;
    this.writeApi = null;
    this.queryApi = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    try {
      this.client = new InfluxDB({
        url: config.influxdb.url,
        token: config.influxdb.token
      });

      this.writeApi = this.client.getWriteApi(
        config.influxdb.org,
        config.influxdb.bucket,
        'ms'
      );

      this.writeApi.useDefaultTags({
        source: 'pipeline-monitor-api'
      });

      this.queryApi = this.client.getQueryApi(config.influxdb.org);
      this.isConnected = true;

      logger.info('InfluxDB client initialized successfully');
    } catch (err) {
      logger.error('Failed to initialize InfluxDB client:', err);
      this.isConnected = false;
    }
  }

  async writeCorrosionData(data) {
    if (!this.isConnected) {
      logger.warn('InfluxDB not connected, skipping write');
      return false;
    }

    try {
      const point = new Point('corrosion_data')
        .tag('deviceId', data.deviceId)
        .tag('pipelineId', data.location.pipelineId)
        .tag('segmentId', data.location.segmentId)
        .floatField('potential', data.corrosion.potential)
        .floatField('kilometerMarker', data.location.kilometerMarker)
        .floatField('latitude', data.location.latitude)
        .floatField('longitude', data.location.longitude);

      if (data.corrosion.wallThickness !== undefined) {
        point.floatField('wallThickness', data.corrosion.wallThickness);
      }
      if (data.corrosion.originalThickness !== undefined) {
        point.floatField('originalThickness', data.corrosion.originalThickness);
      }
      if (data.corrosion.thicknessLossRate !== undefined) {
        point.floatField('thicknessLossRate', data.corrosion.thicknessLossRate);
      }
      if (data.corrosion.corrosionRate !== undefined) {
        point.floatField('corrosionRate', data.corrosion.corrosionRate);
      }

      if (data.environment) {
        if (data.environment.temperature !== undefined) {
          point.floatField('temperature', data.environment.temperature);
        }
        if (data.environment.humidity !== undefined) {
          point.floatField('humidity', data.environment.humidity);
        }
        if (data.environment.ph !== undefined) {
          point.floatField('ph', data.environment.ph);
        }
        if (data.environment.soilResistivity !== undefined) {
          point.floatField('soilResistivity', data.environment.soilResistivity);
        }
      }

      if (data.metadata) {
        if (data.metadata.signalStrength !== undefined) {
          point.intField('signalStrength', data.metadata.signalStrength);
        }
        if (data.metadata.batteryLevel !== undefined) {
          point.intField('batteryLevel', data.metadata.batteryLevel);
        }
        if (data.metadata.firmwareVersion) {
          point.stringField('firmwareVersion', data.metadata.firmwareVersion);
        }
      }

      point.timestamp(new Date(data.timestamp));
      this.writeApi.writePoint(point);

      await this.writeApi.flush();

      logger.debug(`Corrosion data written and flushed for device ${data.deviceId}`);
      return true;
    } catch (err) {
      logger.error('Failed to write corrosion data to InfluxDB:', err);
      return false;
    }
  }

  async writeCorrosionDataBatch(records) {
    if (!this.isConnected) {
      logger.warn('InfluxDB not connected, skipping batch write');
      return false;
    }

    if (records.length === 0) {
      return true;
    }

    try {
      const sortedRecords = [...records].sort((a, b) => a.timestamp - b.timestamp);

      const points = sortedRecords.map(data => {
        const point = new Point('corrosion_data')
          .tag('deviceId', data.deviceId)
          .tag('pipelineId', data.location.pipelineId)
          .tag('segmentId', data.location.segmentId)
          .floatField('potential', data.corrosion.potential)
          .floatField('kilometerMarker', data.location.kilometerMarker)
          .floatField('latitude', data.location.latitude)
          .floatField('longitude', data.location.longitude)
          .timestamp(new Date(data.timestamp));

        if (data.corrosion.wallThickness !== undefined) {
          point.floatField('wallThickness', data.corrosion.wallThickness);
        }
        if (data.corrosion.originalThickness !== undefined) {
          point.floatField('originalThickness', data.corrosion.originalThickness);
        }
        if (data.corrosion.thicknessLossRate !== undefined) {
          point.floatField('thicknessLossRate', data.corrosion.thicknessLossRate);
        }
        if (data.corrosion.corrosionRate !== undefined) {
          point.floatField('corrosionRate', data.corrosion.corrosionRate);
        }

        return point;
      });

      this.writeApi.writePoints(points);
      await this.writeApi.flush();

      logger.debug(`Batch of ${records.length} corrosion data points written and flushed`);
      return true;
    } catch (err) {
      logger.error('Failed to write batch corrosion data to InfluxDB:', err);
      return false;
    }
  }

  async writeAlert(alert) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const point = new Point('alerts')
        .tag('alertId', alert.alertId)
        .tag('deviceId', alert.deviceId)
        .tag('pipelineId', alert.location.pipelineId)
        .tag('segmentId', alert.location.segmentId)
        .tag('level', alert.level)
        .tag('primaryFactor', alert.primaryFactor)
        .tag('acknowledged', String(alert.acknowledged))
        .stringField('title', alert.title)
        .stringField('description', alert.description)
        .floatField('potential', alert.corrosion.potential)
        .floatField('kilometerMarker', alert.location.kilometerMarker)
        .timestamp(new Date(alert.timestamp));

      if (alert.corrosion.thicknessLossRate !== undefined) {
        point.floatField('thicknessLossRate', alert.corrosion.thicknessLossRate);
      }

      this.writeApi.writePoint(point);
      await this.writeApi.flush();
      logger.debug(`Alert written and flushed: ${alert.alertId}`);
      return true;
    } catch (err) {
      logger.error('Failed to write alert to InfluxDB:', err);
      return false;
    }
  }

  async queryData(fluxQuery) {
    if (!this.isConnected) {
      throw new Error('InfluxDB not connected');
    }

    try {
      const result = await this.queryApi.collectRows(fluxQuery);
      return result;
    } catch (err) {
      logger.error('Failed to query InfluxDB:', err);
      throw err;
    }
  }

  async getDeviceData(deviceId, startTime, endTime) {
    const fluxQuery = `
      from(bucket: "${config.influxdb.bucket}")
        |> range(start: ${startTime}, stop: ${endTime})
        |> filter(fn: (r) => r._measurement == "corrosion_data" and r.deviceId == "${deviceId}")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: false)
    `;
    return this.queryData(fluxQuery);
  }

  async getPipelineData(pipelineId, startTime, endTime) {
    const fluxQuery = `
      from(bucket: "${config.influxdb.bucket}")
        |> range(start: ${startTime}, stop: ${endTime})
        |> filter(fn: (r) => r._measurement == "corrosion_data" and r.pipelineId == "${pipelineId}")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: false)
    `;
    return this.queryData(fluxQuery);
  }

  async flush() {
    try {
      await this.writeApi.flush();
      logger.debug('InfluxDB write buffer flushed');
    } catch (err) {
      logger.error('Failed to flush InfluxDB write buffer:', err);
    }
  }

  async close() {
    try {
      await this.writeApi.close();
      this.isConnected = false;
      logger.info('InfluxDB client closed');
    } catch (err) {
      logger.error('Failed to close InfluxDB client:', err);
    }
  }
}

module.exports = new InfluxDBService();
