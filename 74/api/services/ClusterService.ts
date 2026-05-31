import { kmeans as kmeansFn } from 'ml-kmeans';
import { SecurityData, AnomalyCluster, AnomalyAlert, AnomalyType, Severity } from '../../shared/types.js';
import { dataRepository } from '../repositories/DataRepository.js';
import { alertRepository } from '../repositories/AlertRepository.js';
import { broadcastAlert } from '../websocket/index.js';
import { alertCache } from '../cache/index.js';

export class ClusterService {
  private lastClusterTime: Map<string, number> = new Map();

  detectAndCluster(data: SecurityData[]): AnomalyCluster[] {
    if (data.length < 5) return [];

    const anomalies = data.filter(d => d.status !== 'normal');
    if (anomalies.length < 3) return [];

    const points = anomalies.map(d => [d.location.lat, d.location.lng, d.value]);
    const nClusters = Math.min(Math.max(2, Math.floor(anomalies.length / 5)), 8);

    try {
      const result = kmeansFn(points, nClusters, {
        maxIterations: 100,
        tolerance: 1e-6
      });

      const clusters: Map<number, SecurityData[]> = new Map();
      result.clusters.forEach((clusterIndex, i) => {
        if (!clusters.has(clusterIndex)) {
          clusters.set(clusterIndex, []);
        }
        clusters.get(clusterIndex)!.push(anomalies[i]);
      });

      const anomalyClusters: AnomalyCluster[] = [];
      clusters.forEach((points, clusterId) => {
        if (points.length < 3) return;

        const centerLat = points.reduce((sum, p) => sum + p.location.lat, 0) / points.length;
        const centerLng = points.reduce((sum, p) => sum + p.location.lng, 0) / points.length;

        const anomalyType = this.determineAnomalyType(points);
        const severity = this.determineSeverity(points);

        const timestamps = points.map(p => p.timestamp);
        const startTime = Math.min(...timestamps);
        const endTime = Math.max(...timestamps);

        const clusterKey = `${clusterId}_${Math.floor(startTime / 300000)}`;
        if (!this.lastClusterTime.has(clusterKey) || Date.now() - this.lastClusterTime.get(clusterKey)! > 300000) {
          this.lastClusterTime.set(clusterKey, Date.now());

          const areas = [...new Set(points.map(p => p.location.area))];
          alertRepository.insertCluster({
            clusterId,
            center: { lat: centerLat, lng: centerLng },
            anomalyType,
            type: anomalyType,
            severity,
            startTime,
            endTime,
            detectedAt: Date.now(),
            area: areas[0] || '未知区域'
          });

          this.createAlertsForCluster(points, anomalyType, severity);
        }

        const areas = [...new Set(points.map(p => p.location.area))];
        anomalyClusters.push({
          id: `cluster_${clusterId}_${Date.now()}`,
          clusterId,
          dataPoints: points,
          center: { lat: centerLat, lng: centerLng },
          anomalyType,
          type: anomalyType,
          severity,
          startTime,
          endTime,
          detectedAt: Date.now(),
          pointCount: points.length,
          area: areas[0] || '未知区域'
        });
      });

      return anomalyClusters;
    } catch (error) {
      console.error('Clustering error:', error);
      return [];
    }
  }

  private determineAnomalyType(points: SecurityData[]): AnomalyType {
    const types = points.map(p => p.deviceType);
    const typeCounts = types.reduce((acc, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alarmCount = typeCounts['alarm'] || 0;
    const cameraCount = typeCounts['camera'] || 0;
    const accessCount = typeCounts['access'] || 0;
    const dangerPoints = points.filter(p => p.status === 'danger').length;
    const warningPoints = points.filter(p => p.status === 'warning').length;
    const totalAnomalyRatio = (dangerPoints + warningPoints) / points.length;
    const avgValue = points.reduce((s, p) => s + p.value, 0) / points.length;

    if (alarmCount > 0 && dangerPoints >= 2 && avgValue > 15) {
      return 'intrusion';
    }
    if (cameraCount >= 2 && points.length >= 5 && totalAnomalyRatio > 0.4) {
      return 'crowd';
    }
    if (accessCount > 0 && avgValue > 30 && warningPoints >= 2) {
      return 'fault';
    }
    if (dangerPoints >= 1 && alarmCount === 0 && cameraCount > 0) {
      return 'intrusion';
    }
    if (warningPoints >= 2 && totalAnomalyRatio > 0.3) {
      return 'other';
    }
    return 'unknown';
  }

  private determineSeverity(points: SecurityData[]): Severity {
    const dangerCount = points.filter(p => p.status === 'danger').length;
    const warningCount = points.filter(p => p.status === 'warning').length;
    const totalCount = points.length;

    if (dangerCount >= totalCount * 0.5 || dangerCount >= 3) {
      return 'high';
    }
    if (warningCount >= totalCount * 0.3 || warningCount >= 2) {
      return 'medium';
    }
    return 'low';
  }

  private createAlertsForCluster(
    points: SecurityData[],
    anomalyType: AnomalyType,
    severity: Severity
  ) {
    const devices = dataRepository.getDevices();
    const deviceMap = new Map(devices.map(d => [d.id, d]));

    const deviceIds = points.map(p => p.deviceId).slice(0, 10);
    const areas = [...new Set(points.map(p => p.location.area))];
    const uniqueDevicePoints = new Map<string, SecurityData>();
    points.forEach(p => {
      if (!uniqueDevicePoints.has(p.deviceId)) {
        uniqueDevicePoints.set(p.deviceId, p);
      }
    });

    Array.from(uniqueDevicePoints.values()).slice(0, 5).forEach(point => {
      const device = deviceMap.get(point.deviceId);
      const alert: Omit<AnomalyAlert, 'id'> = {
        dataId: point.id,
        level: severity,
        severity: severity,
        type: anomalyType,
        description: `${anomalyType === 'intrusion' ? '异常入侵' : anomalyType === 'crowd' ? '异常聚集' : anomalyType === 'fault' ? '设备故障' : anomalyType === 'other' ? '异常事件' : '未知异常'} - ${device?.name || point.deviceId}`,
        status: 'pending',
        createdAt: Date.now(),
        timestamp: Date.now(),
        deviceName: device?.name,
        location: point.location,
        area: areas[0] || point.location.area,
        deviceIds: deviceIds
      };

      const alertId = alertRepository.insertAlert(alert);
      const fullAlert: AnomalyAlert = { ...alert, id: alertId };

      alertCache.set(alertId, fullAlert);
      broadcastAlert(fullAlert);
    });
  }

  getClusters(limit: number = 20): AnomalyCluster[] {
    return alertRepository.getClusters(limit);
  }

  getAlerts(
    limit: number = 50,
    level?: Severity,
    status?: AnomalyAlert['status']
  ): AnomalyAlert[] {
    const cached = alertCache.values();
    if (cached.length >= limit && !level && !status) {
      return cached.slice(0, limit);
    }

    return alertRepository.getAlerts(limit, level, status);
  }

  updateAlertStatus(alertId: string, status: AnomalyAlert['status']): boolean {
    const result = alertRepository.updateAlertStatus(alertId, status);
    if (result) {
      alertCache.delete(alertId);
    }
    return result;
  }

  getAlertStats() {
    return alertRepository.getAlertStats();
  }

  runPeriodicClustering() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const data = dataRepository.getHistoricalData(oneHourAgo, now);
    return this.detectAndCluster(data);
  }
}

export const clusterService = new ClusterService();
export default clusterService;
