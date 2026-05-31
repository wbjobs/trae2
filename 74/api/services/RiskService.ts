import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { dataRepository } from '../repositories/DataRepository.js';
import { alertRepository } from '../repositories/AlertRepository.js';
import { heatmapCache, hourlyRiskCache, riskOverviewCache, areaRiskCache } from '../cache/index.js';
import {
  RiskStatistics,
  HeatmapPoint,
  TimeRange,
  RiskLevel,
  HourlyRiskData,
  DeviceType
} from '../../shared/types.js';

export class RiskService {
  getHeatmapData(
    timeRange: TimeRange = '24h',
    area?: string,
    deviceType?: DeviceType
  ): { points: HeatmapPoint[]; maxValue: number; updateTime: number } {
    const cacheKey = `heatmap_${timeRange}_${area || 'all'}_${deviceType || 'all'}`;
    const cached = heatmapCache.get(cacheKey);
    if (cached) return cached;

    const rawData = dataRepository.getHeatmapData(timeRange, area, deviceType);

    const gridMap = new Map<string, { lat: number; lng: number; value: number; count: number }>();

    rawData.forEach(p => {
      const gridLat = Math.round(p.lat * 100) / 100;
      const gridLng = Math.round(p.lng * 100) / 100;
      const key = `${gridLat}_${gridLng}`;

      if (!gridMap.has(key)) {
        gridMap.set(key, { lat: gridLat, lng: gridLng, value: 0, count: 0 });
      }

      const entry = gridMap.get(key)!;
      entry.value += p.value;
      entry.count++;
    });

    const points: HeatmapPoint[] = Array.from(gridMap.values()).map(e => ({
      lat: e.lat,
      lng: e.lng,
      value: Math.round((e.value / Math.max(e.count, 1)) * 10) / 10
    }));

    const maxValue = points.length > 0 ? Math.max(...points.map(p => p.value)) : 100;

    const result = {
      points,
      maxValue,
      updateTime: Date.now()
    };

    heatmapCache.set(cacheKey, result);
    return result;
  }

  calculateRisk(
    area: string,
    timeRange: TimeRange = '24h'
  ): RiskStatistics {
    const areas = dataRepository.getAreas();
    const areaInfo = areas.find(a => a.code === area) || areas[0];

    const now = Date.now();
    const rangeMs = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    }[timeRange];

    const startTime = now - rangeMs;

    const statusCounts = dataRepository.getDataCountByStatus(startTime, now);
    const totalData = statusCounts.normal + statusCounts.warning + statusCounts.danger;
    const anomalyCount = statusCounts.warning + statusCounts.danger;
    const anomalyRate = totalData > 0 ? anomalyCount / totalData : 0;

    const deviceStats = dataRepository.getDevices();
    const areaDevices = deviceStats.filter(d => d.areaCode === area);

    const alertStats = alertRepository.getAlertStats();
    const alerts = alertRepository.getAlerts(100);
    const areaAlerts = alerts.filter(a => a.location?.area === area);

    let riskScore = 50;
    const dangerWeight = statusCounts.danger * 10;
    const warningWeight = statusCounts.warning * 3;
    riskScore += dangerWeight + warningWeight;

    const alertCount = areaAlerts.length;
    riskScore += alertCount * 5;

    const deviceHealth = areaDevices.length > 0
      ? (areaDevices.filter(d => d.status === 'online').length / areaDevices.length) * 100
      : 100;
    riskScore -= (deviceHealth - 80) * 0.5;

    riskScore = Math.max(0, Math.min(100, riskScore));

    let riskLevel: RiskLevel = 'safe';
    if (riskScore >= 70) riskLevel = 'danger';
    else if (riskScore >= 40) riskLevel = 'caution';

    const trend = this.generateTrendData(area, 12);

    const riskRecordStmt = db.prepare(`
      INSERT OR REPLACE INTO risk_records (id, area_code, time_period, risk_score, risk_level, alert_count, device_health)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    riskRecordStmt.run(
      uuidv4(),
      area,
      timeRange,
      Math.round(riskScore),
      riskLevel,
      alertCount,
      Math.round(deviceHealth * 10) / 10
    );

    return {
      area,
      areaName: areaInfo?.name || area,
      timeRange,
      riskScore: Math.round(riskScore),
      riskLevel,
      alertCount,
      deviceHealth: Math.round(deviceHealth * 10) / 10,
      anomalyRate: Math.round(anomalyRate * 1000) / 1000,
      trend
    };
  }

  getAllAreaRisks(timeRange: TimeRange = '24h'): RiskStatistics[] {
    const areas = dataRepository.getAreas();
    return areas.map(area => this.calculateRisk(area.code, timeRange))
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  getHourlyRiskData(area?: string): HourlyRiskData[] {
    const cacheKey = `hourly_${area || 'all'}`;
    const cached = hourlyRiskCache.get(cacheKey);
    if (cached) return cached;

    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    let sql = `
      SELECT 
        CAST(strftime('%H', timestamp / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
        SUM(CASE WHEN status = 'danger' THEN 10 WHEN status = 'warning' THEN 3 ELSE 1 END) as raw_score,
        COUNT(*) as count
      FROM security_data
      WHERE timestamp >= ? AND timestamp <= ?
    `;
    const params: any[] = [twentyFourHoursAgo, now];

    if (area) {
      sql += ` AND device_id IN (SELECT id FROM devices WHERE area_code = ?)`;
      params.push(area);
    }

    sql += ' GROUP BY hour ORDER BY hour';

    const rows = db.prepare(sql).all(...params) as Array<{ hour: number; raw_score: number; count: number }>;

    const hourMap = new Map<number, { rawScore: number; count: number }>();
    rows.forEach(r => hourMap.set(r.hour, { rawScore: r.raw_score, count: r.count }));

    const result: HourlyRiskData[] = [];
    for (let h = 0; h < 24; h++) {
      const entry = hourMap.get(h);
      const normalizedScore = entry && entry.count > 0
        ? Math.min(100, Math.round((entry.rawScore / entry.count) * 20))
        : 0;

      let alertCount = 0;
      if (area) {
        const alertSql = `
          SELECT COUNT(*) as cnt
          FROM anomaly_alerts a
          JOIN security_data sd ON a.data_id = sd.id
          JOIN devices d ON sd.device_id = d.id
          WHERE d.area_code = ?
          AND a.created_at >= datetime(?, 'unixepoch', 'localtime')
          AND a.created_at <= datetime(?, 'unixepoch', 'localtime')
          AND CAST(strftime('%H', a.created_at) AS INTEGER) = ?
        `;
        const alertRow = db.prepare(alertSql).get(area, twentyFourHoursAgo / 1000, now / 1000, h) as { cnt: number };
        alertCount = alertRow?.cnt || 0;
      }

      result.push({ hour: h, riskScore: normalizedScore, alertCount });
    }

    hourlyRiskCache.set(cacheKey, result);
    return result;
  }

  private generateTrendData(area: string, points: number): number[] {
    const baseRisk = 30 + Math.random() * 30;
    const trend: number[] = [];
    let currentRisk = baseRisk;

    for (let i = 0; i < points; i++) {
      currentRisk += (Math.random() - 0.5) * 15;
      currentRisk = Math.max(10, Math.min(90, currentRisk));
      trend.push(Math.round(currentRisk));
    }

    return trend;
  }

  getDeviceHealthByArea(): Array<{ area: string; areaName: string; health: number; total: number; online: number }> {
    const areas = dataRepository.getAreas();
    const devices = dataRepository.getDevices();

    return areas.map(area => {
      const areaDevices = devices.filter(d => d.areaCode === area.code);
      const onlineCount = areaDevices.filter(d => d.status === 'online').length;
      const health = areaDevices.length > 0
        ? Math.round((onlineCount / areaDevices.length) * 100 * 10) / 10
        : 100;

      return {
        area: area.code,
        areaName: area.name,
        health,
        total: areaDevices.length,
        online: onlineCount
      };
    });
  }

  getTopRiskAreas(limit: number = 5, timeRange: TimeRange = '24h') {
    const cacheKey = `top_risk_${limit}_${timeRange}`;
    const cached = areaRiskCache.get(cacheKey);
    if (cached) return cached;

    const result = this.getAllAreaRisks(timeRange).slice(0, limit);
    areaRiskCache.set(cacheKey, result);
    return result;
  }

  getOverallStats(timeRange: TimeRange = '24h') {
    const cacheKey = `overall_${timeRange}`;
    const cached = riskOverviewCache.get(cacheKey);
    if (cached) return cached;

    const allRisks = this.getAllAreaRisks(timeRange);
    const avgRisk = allRisks.reduce((sum, r) => sum + r.riskScore, 0) / allRisks.length;
    const totalAlerts = allRisks.reduce((sum, r) => sum + r.alertCount, 0);
    const dangerAreas = allRisks.filter(r => r.riskLevel === 'danger').length;
    const cautionAreas = allRisks.filter(r => r.riskLevel === 'caution').length;
    const safeAreas = allRisks.filter(r => r.riskLevel === 'safe').length;
    const avgDeviceHealth = allRisks.reduce((sum, r) => sum + r.deviceHealth, 0) / allRisks.length;

    let overallLevel: RiskLevel = 'safe';
    if (avgRisk >= 60) overallLevel = 'danger';
    else if (avgRisk >= 35) overallLevel = 'caution';

    const result = {
      overallRiskScore: Math.round(avgRisk),
      overallRiskLevel: overallLevel,
      totalAlerts,
      dangerAreas,
      cautionAreas,
      safeAreas,
      avgDeviceHealth: Math.round(avgDeviceHealth * 10) / 10,
      timeRange
    };
    riskOverviewCache.set(cacheKey, result);
    return result;
  }
}

export const riskService = new RiskService();
export default riskService;
