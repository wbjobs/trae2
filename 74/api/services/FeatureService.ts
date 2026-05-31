import { SecurityData, TimeSeriesFeatures } from '../../shared/types.js';
import { dataRepository } from '../repositories/DataRepository.js';
import { StatCalculator } from './features/StatCalculator.js';
import { PeakDetector } from './features/PeakDetector.js';
import { TrendAnalyzer } from './features/TrendAnalyzer.js';

export class FeatureService {
  extractFeatures(
    data: SecurityData[],
    period: 'hour' | 'day' | 'week' = 'hour',
    deviceId?: string
  ): TimeSeriesFeatures[] {
    if (data.length === 0) return [];

    const groupedByDevice = new Map<string, SecurityData[]>();
    data.forEach(d => {
      const key = deviceId || d.deviceId;
      if (!groupedByDevice.has(key)) {
        groupedByDevice.set(key, []);
      }
      groupedByDevice.get(key)!.push(d);
    });

    const features: TimeSeriesFeatures[] = [];
    const devices = dataRepository.getDevices();
    const deviceMap = new Map(devices.map(d => [d.id, d.name]));

    groupedByDevice.forEach((deviceData, devId) => {
      if (deviceData.length < 3) return;

      const values = deviceData.map(d => d.value);
      const timestamps = deviceData.map(d => d.timestamp);

      const stats = StatCalculator.computeAll(values);
      const peakCount = PeakDetector.count(values, stats.mean, stats.std);
      const trend = TrendAnalyzer.halfSplitTrend(values);

      features.push({
        deviceId: devId,
        deviceName: deviceMap.get(devId),
        period,
        mean: stats.mean,
        std: stats.std,
        max: stats.max,
        min: stats.min,
        q1: stats.q1,
        median: stats.median,
        q3: stats.q3,
        rms: stats.rms,
        peakCount,
        volatility: stats.volatility,
        trend,
        features: [
          stats.mean, stats.std, stats.q1, stats.median, stats.q3,
          stats.rms, stats.volatility, peakCount
        ],
        timeRange: [Math.min(...timestamps), Math.max(...timestamps)],
        timestamp: Date.now()
      });
    });

    return features;
  }

  getFeatures(
    deviceId?: string,
    timeRange: '1h' | '6h' | '24h' | '7d' = '24h',
    period: 'hour' | 'day' | 'week' = 'hour'
  ): TimeSeriesFeatures[] {
    const now = Date.now();
    const rangeMs = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    }[timeRange];

    const startTime = now - rangeMs;
    const data = dataRepository.getHistoricalData(startTime, now, deviceId);

    return this.extractFeatures(data, period, deviceId);
  }
}

export const featureService = new FeatureService();
export default featureService;
