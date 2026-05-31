import db from '../db/index.js';
import { dataRepository } from '../repositories/DataRepository.js';
import { TrendAnalyzer } from './features/TrendAnalyzer.js';
import { StatCalculator } from './features/StatCalculator.js';
import { predictionCache, deviceRankingCache } from '../cache/index.js';
import { TimeRange } from '../../shared/types.js';

export interface PredictionPoint {
  timestamp: number;
  predictedRisk: number;
  upperBound: number;
  lowerBound: number;
  confidence: number;
}

export interface AreaPrediction {
  area: string;
  areaName: string;
  currentRisk: number;
  predictions: PredictionPoint[];
  trend: 'rising' | 'stable' | 'declining';
  nextHourRisk: number;
}

export interface DeviceRankingItem {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  area: string;
  areaName: string;
  anomalyScore: number;
  alertCount: number;
  avgValue: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export class PredictionService {
  predictRisk(area?: string, hours: number = 6): AreaPrediction[] {
    const cacheKey = `pred_${area || 'all'}_${hours}`;
    const cached = predictionCache.get(cacheKey);
    if (cached) return cached;

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    let sql = `
      SELECT
        dev.area_code,
        a.name as area_name,
        CAST(strftime('%H', sd.timestamp / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
        AVG(sd.value) as avg_value,
        COUNT(*) as cnt,
        SUM(CASE WHEN sd.status = 'danger' THEN 1 ELSE 0 END) as danger_cnt,
        SUM(CASE WHEN sd.status = 'warning' THEN 1 ELSE 0 END) as warning_cnt
      FROM security_data sd
      JOIN devices dev ON sd.device_id = dev.id
      JOIN areas a ON dev.area_code = a.code
      WHERE sd.timestamp >= ? AND sd.timestamp <= ?
    `;
    const params: any[] = [now - 24 * 60 * 60 * 1000, now];

    if (area) {
      sql += ' AND dev.area_code = ?';
      params.push(area);
    }

    sql += ' GROUP BY dev.area_code, hour ORDER BY dev.area_code, hour';

    const rows = db.prepare(sql).all(...params) as Array<{
      area_code: string; area_name: string; hour: number;
      avg_value: number; cnt: number; danger_cnt: number; warning_cnt: number;
    }>;

    const areaMap = new Map<string, { name: string; hourlyScores: number[] }>();
    rows.forEach(r => {
      if (!areaMap.has(r.area_code)) {
        areaMap.set(r.area_code, { name: r.area_name, hourlyScores: [] });
      }
      const score = r.cnt > 0
        ? Math.min(100, (r.danger_cnt * 10 + r.warning_cnt * 3) / r.cnt * 20 + r.avg_value * 0.3)
        : 30;
      areaMap.get(r.area_code)!.hourlyScores.push(Math.round(score));
    });

    const predictions: AreaPrediction[] = [];
    areaMap.forEach((data, areaCode) => {
      const scores = data.hourlyScores;
      if (scores.length < 2) return;

      const smoothed = TrendAnalyzer.exponentialSmoothing(scores, 0.3);
      const currentRisk = smoothed[smoothed.length - 1] || 50;
      const { slope } = TrendAnalyzer.linearRegression(smoothed);

      const predPoints: PredictionPoint[] = [];
      let lastValue = currentRisk;
      for (let h = 1; h <= hours; h++) {
        const predicted = Math.max(0, Math.min(100, lastValue + slope + (Math.random() - 0.5) * 5));
        const uncertainty = h * 3;
        predPoints.push({
          timestamp: now + h * 60 * 60 * 1000,
          predictedRisk: Math.round(predicted),
          upperBound: Math.min(100, Math.round(predicted + uncertainty)),
          lowerBound: Math.max(0, Math.round(predicted - uncertainty)),
          confidence: Math.max(0.5, 1 - h * 0.08)
        });
        lastValue = predicted;
      }

      const trendDir: 'rising' | 'stable' | 'declining' = slope > 1 ? 'rising' : slope < -1 ? 'declining' : 'stable';

      predictions.push({
        area: areaCode,
        areaName: data.name,
        currentRisk: Math.round(currentRisk),
        predictions: predPoints,
        trend: trendDir,
        nextHourRisk: predPoints[0]?.predictedRisk || Math.round(currentRisk)
      });
    });

    predictionCache.set(cacheKey, predictions);
    return predictions;
  }

  getDeviceRanking(timeRange: TimeRange = '24h', limit: number = 20): DeviceRankingItem[] {
    const cacheKey = `dev_rank_${timeRange}_${limit}`;
    const cached = deviceRankingCache.get(cacheKey);
    if (cached) return cached;

    const now = Date.now();
    const rangeMs = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    }[timeRange];

    const sql = `
      SELECT 
        dev.id as device_id,
        dev.name as device_name,
        dev.type as device_type,
        dev.area_code,
        a.name as area_name,
        AVG(sd.value) as avg_value,
        COUNT(*) as total_count,
        SUM(CASE WHEN sd.status = 'danger' THEN 1 ELSE 0 END) as danger_count,
        SUM(CASE WHEN sd.status = 'warning' THEN 1 ELSE 0 END) as warning_count,
        COUNT(DISTINCT aa.id) as alert_count
      FROM devices dev
      JOIN areas a ON dev.area_code = a.code
      LEFT JOIN security_data sd ON sd.device_id = dev.id AND sd.timestamp >= ? AND sd.timestamp <= ?
      LEFT JOIN anomaly_alerts aa ON aa.data_id = sd.id
      GROUP BY dev.id
      ORDER BY (COALESCE(danger_count, 0) * 10 + COALESCE(warning_count, 0) * 3 + COALESCE(alert_count, 0) * 5) DESC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(now - rangeMs, now, limit) as any[];

    const result: DeviceRankingItem[] = rows.map(row => {
      const anomalyScore = (row.danger_count || 0) * 10 + (row.warning_count || 0) * 3 + (row.alert_count || 0) * 5;
      const riskLevel: 'low' | 'medium' | 'high' = anomalyScore > 30 ? 'high' : anomalyScore > 10 ? 'medium' : 'low';

      return {
        deviceId: row.device_id,
        deviceName: row.device_name,
        deviceType: row.device_type,
        area: row.area_code,
        areaName: row.area_name,
        anomalyScore: Math.round(anomalyScore * 10) / 10,
        alertCount: row.alert_count || 0,
        avgValue: Math.round((row.avg_value || 0) * 100) / 100,
        riskLevel
      };
    });

    deviceRankingCache.set(cacheKey, result);
    return result;
  }
}

export const predictionService = new PredictionService();
export default predictionService;
