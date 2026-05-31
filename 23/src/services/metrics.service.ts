import logger from '../utils/logger';

export interface MetricsData {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  activeConnections: number;
  averageResponseTime: number;
  requestPerSecond: number;
  terminalCount: number;
  alarmCount: number;
  errorRate: number;
  uptime: number;
}

class MetricsCollector {
  private startTime: number = Date.now();
  private totalRequests: number = 0;
  private successRequests: number = 0;
  private failedRequests: number = 0;
  private responseTimes: number[] = [];
  private readonly maxResponseTimes: number = 1000;

  incrementSuccess(): void {
    this.totalRequests++;
    this.successRequests++;
  }

  incrementFailed(): void {
    this.totalRequests++;
    this.failedRequests++;
  }

  recordResponseTime(ms: number): void {
    this.responseTimes.push(ms);
    if (this.responseTimes.length > this.maxResponseTimes) {
      this.responseTimes.shift();
    }
  }

  getMetrics(): MetricsData {
    const uptime = Date.now() - this.startTime;
    const averageResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
        : 0;
    const requestPerSecond = this.totalRequests / (uptime / 1000);
    const errorRate =
      this.totalRequests > 0 ? this.failedRequests / this.totalRequests : 0;

    return {
      totalRequests: this.totalRequests,
      successRequests: this.successRequests,
      failedRequests: this.failedRequests,
      activeConnections: 0,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      requestPerSecond: Math.round(requestPerSecond * 100) / 100,
      terminalCount: 0,
      alarmCount: 0,
      errorRate: Math.round(errorRate * 10000) / 10000,
      uptime,
    };
  }

  reset(): void {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.successRequests = 0;
    this.failedRequests = 0;
    this.responseTimes = [];
    logger.info('Metrics reset');
  }
}

export const metricsCollector = new MetricsCollector();
