import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { AnomalyAlert, AnomalyCluster, Severity, AnomalyType } from '../../shared/types.js';

export class AlertRepository {
  insertCluster(cluster: Omit<AnomalyCluster, 'id' | 'dataPoints' | 'pointCount'>): string {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO anomaly_clusters 
      (id, cluster_number, type, severity, start_time, end_time, center_lat, center_lng)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      cluster.clusterId,
      cluster.anomalyType,
      cluster.severity,
      cluster.startTime,
      cluster.endTime,
      cluster.center.lat,
      cluster.center.lng
    );
    return id;
  }

  insertAlert(alert: Omit<AnomalyAlert, 'id'>): string {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO anomaly_alerts 
      (id, data_id, cluster_id, level, type, description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      alert.dataId,
      alert.clusterId || null,
      alert.level,
      alert.type,
      alert.description,
      alert.status
    );
    return id;
  }

  getAlerts(
    limit: number = 50,
    level?: Severity,
    status?: AnomalyAlert['status']
  ): AnomalyAlert[] {
    let sql = `
      SELECT a.*, sd.timestamp, sd.lat, sd.lng, d.name as device_name, d.area_code
      FROM anomaly_alerts a
      JOIN security_data sd ON a.data_id = sd.id
      JOIN devices d ON sd.device_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (level) {
      sql += ' AND a.level = ?';
      params.push(level);
    }
    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      dataId: row.data_id,
      clusterId: row.cluster_id || undefined,
      level: row.level,
      severity: row.level,
      type: row.type,
      description: row.description,
      status: row.status,
      createdAt: new Date(row.created_at).getTime(),
      timestamp: new Date(row.created_at).getTime(),
      deviceName: row.device_name,
      location: {
        lat: row.lat,
        lng: row.lng,
        area: row.area_code
      },
      area: row.area_code,
      deviceIds: row.device_ids ? JSON.parse(row.device_ids) : []
    }));
  }

  getClusters(limit: number = 20): AnomalyCluster[] {
    const sql = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM security_data sd 
              WHERE sd.timestamp >= c.start_time AND sd.timestamp <= c.end_time
              AND ABS(sd.lat - c.center_lat) < 0.01 AND ABS(sd.lng - c.center_lng) < 0.01) as point_count
      FROM anomaly_clusters c
      ORDER BY c.start_time DESC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(limit) as any[];
    return rows.map(row => ({
      id: row.id,
      clusterId: row.cluster_number,
      dataPoints: [],
      center: {
        lat: row.center_lat,
        lng: row.center_lng
      },
      anomalyType: row.type,
      type: row.type,
      severity: row.severity,
      startTime: row.start_time,
      endTime: row.end_time,
      detectedAt: row.start_time,
      pointCount: row.point_count || 0,
      area: row.area_code || '未知区域'
    }));
  }

  updateAlertStatus(alertId: string, status: AnomalyAlert['status']): boolean {
    const stmt = db.prepare('UPDATE anomaly_alerts SET status = ? WHERE id = ?');
    const result = stmt.run(status, alertId);
    return result.changes > 0;
  }

  getAlertStats(): { pending: number; processing: number; resolved: number; byLevel: Record<Severity, number> } {
    const rows = db.prepare(`
      SELECT status, level, COUNT(*) as count
      FROM anomaly_alerts
      GROUP BY status, level
    `).all() as Array<{ status: string; level: string; count: number }>;

    const result = {
      pending: 0,
      processing: 0,
      resolved: 0,
      byLevel: { low: 0, medium: 0, high: 0 } as Record<Severity, number>
    };

    rows.forEach(row => {
      if (row.status in result) {
        (result as any)[row.status] = row.count;
      }
      if (row.level in result.byLevel) {
        result.byLevel[row.level as Severity] += row.count;
      }
    });

    return result;
  }
}

export const alertRepository = new AlertRepository();
export default alertRepository;
