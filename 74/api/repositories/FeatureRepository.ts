import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { TimeSeriesFeatures } from '../../shared/types.js';

export class FeatureRepository {
  saveFeatures(features: Omit<TimeSeriesFeatures, 'deviceName'>): string {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO time_series_features 
      (id, device_id, period, mean, std, max, min, peak_count, volatility, trend, features, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      features.deviceId,
      features.period,
      features.mean,
      features.std,
      features.max,
      features.min,
      features.peakCount,
      features.volatility,
      features.trend,
      JSON.stringify(features.features),
      features.timeRange[0],
      features.timeRange[1]
    );
    return id;
  }

  getLatestFeatures(deviceId: string, period?: string): TimeSeriesFeatures | null {
    let sql = `
      SELECT f.*, d.name as device_name
      FROM time_series_features f
      JOIN devices d ON f.device_id = d.id
      WHERE f.device_id = ?
    `;
    const params: any[] = [deviceId];

    if (period) {
      sql += ' AND f.period = ?';
      params.push(period);
    }

    sql += ' ORDER BY f.created_at DESC LIMIT 1';

    const row = db.prepare(sql).get(...params) as any;
    if (!row) return null;

    return {
      deviceId: row.device_id,
      deviceName: row.device_name,
      period: row.period,
      mean: row.mean,
      std: row.std,
      max: row.max,
      min: row.min,
      q1: row.q1 || 0,
      median: row.median || 0,
      q3: row.q3 || 0,
      rms: row.rms || 0,
      peakCount: row.peak_count,
      volatility: row.volatility,
      trend: typeof row.trend === 'string' ? (row.trend === 'up' ? 0.1 : row.trend === 'down' ? -0.1 : 0) : (row.trend || 0),
      features: JSON.parse(row.features),
      timeRange: [row.start_time, row.end_time],
      timestamp: new Date(row.created_at).getTime()
    };
  }
}

export const featureRepository = new FeatureRepository();
export default featureRepository;
