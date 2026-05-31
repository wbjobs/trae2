const config = require('../config');
const logger = require('../utils/logger');

const metrics = {
  counter: {
    http_requests_total: 0,
    http_requests_success: 0,
    http_requests_error: 0,
    device_reports_total: 0,
    device_reports_success: 0,
    device_reports_failed: 0,
    batch_reports_total: 0,
    alerts_triggered_total: 0,
    alerts_cleared_total: 0,
    points_written_total: 0,
    queue_jobs_processed: 0,
    queue_jobs_failed: 0,
    rate_limited_requests: 0
  },

  gauge: {
    http_active_requests: 0,
    queue_depth_waiting: 0,
    queue_depth_active: 0,
    active_alerts: 0,
    active_rules: 0,
    connected_devices: 0,
    influx_write_buffer_size: 0,
    process_memory_heap_used: 0,
    process_memory_rss: 0,
    process_uptime: 0
  },

  histogram: {},

  labels: {
    instance: `${require('os').hostname()}:${config.port}`,
    pid: process.pid
  },

  startTime: Date.now(),

  incrementCounter(name, value = 1) {
    if (this.counter[name] !== undefined) {
      this.counter[name] += value;
    }
  },

  setGauge(name, value) {
    if (this.gauge[name] !== undefined) {
      this.gauge[name] = value;
    }
  },

  recordRequest(method, path, statusCode, duration) {
    this.incrementCounter('http_requests_total');

    if (statusCode >= 200 && statusCode < 400) {
      this.incrementCounter('http_requests_success');
    } else {
      this.incrementCounter('http_requests_error');
    }

    if (path.includes('/report/batch')) {
      this.incrementCounter('batch_reports_total');
    } else if (path.includes('/report')) {
      this.incrementCounter('device_reports_total');
    }
  },

  recordRateLimited() {
    this.incrementCounter('rate_limited_requests');
  },

  recordAlert(severity = 'warning') {
    this.incrementCounter('alerts_triggered_total');
  },

  recordPointsWritten(count) {
    this.incrementCounter('points_written_total', count);
  },

  updateSystemMetrics() {
    const memUsage = process.memoryUsage();
    this.setGauge('process_memory_heap_used', memUsage.heapUsed);
    this.setGauge('process_memory_rss', memUsage.rss);
    this.setGauge('process_uptime', process.uptime());
  },

  formatPrometheus() {
    let output = '';

    for (const [name, value] of Object.entries(this.counter)) {
      output += `# TYPE ${name} counter\n`;
      output += `${name}{instance="${this.labels.instance}",pid="${this.labels.pid}"} ${value}\n\n`;
    }

    for (const [name, value] of Object.entries(this.gauge)) {
      output += `# TYPE ${name} gauge\n`;
      output += `${name}{instance="${this.labels.instance}",pid="${this.labels.pid}"} ${value}\n\n`;
    }

    return output;
  },

  getStats() {
    return {
      counter: { ...this.counter },
      gauge: { ...this.gauge },
      labels: { ...this.labels },
      uptime: Date.now() - this.startTime
    };
  },

  reset() {
    for (const key of Object.keys(this.counter)) {
      this.counter[key] = 0;
    }
    for (const key of Object.keys(this.gauge)) {
      this.gauge[key] = 0;
    }
  }
};

setInterval(() => {
  try {
    metrics.updateSystemMetrics();
  } catch (error) {
    logger.debug(`指标更新失败: ${error.message}`);
  }
}, 5000);

module.exports = metrics;
