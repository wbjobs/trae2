import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { SecurityData, Device, Area, TimeRange } from '../../shared/types.js';
import { deviceCache, historicalDataCache, statusCountCache } from '../cache/index.js';

export class DataRepository {
  insertData(data: Omit<SecurityData, 'id'>): string {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO security_data (id, device_id, timestamp, value, status, lat, lng, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.deviceId,
      data.timestamp,
      data.value,
      data.status,
      data.location.lat,
      data.location.lng,
      data.metadata ? JSON.stringify(data.metadata) : null
    );
    return id;
  }

  getDataById(id: string): SecurityData | null {
    const row = db.prepare(`
      SELECT d.*, dev.type as device_type, a.code as area_code, a.name as area_name
      FROM security_data d
      JOIN devices dev ON d.device_id = dev.id
      JOIN areas a ON dev.area_code = a.code
      WHERE d.id = ?
    `).get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      deviceId: row.device_id,
      deviceType: row.device_type,
      timestamp: row.timestamp,
      location: {
        lat: row.lat,
        lng: row.lng,
        area: row.area_code
      },
      value: row.value,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  getRealtimeData(limit: number = 100, deviceType?: string): SecurityData[] {
    let sql = `
      SELECT d.*, dev.type as device_type, a.code as area_code
      FROM security_data d
      JOIN devices dev ON d.device_id = dev.id
      JOIN areas a ON dev.area_code = a.code
    `;
    const params: any[] = [];

    if (deviceType) {
      sql += ' WHERE dev.type = ?';
      params.push(deviceType);
    }

    sql += ' ORDER BY d.timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      deviceId: row.device_id,
      deviceType: row.device_type,
      timestamp: row.timestamp,
      location: {
        lat: row.lat,
        lng: row.lng,
        area: row.area_code
      },
      value: row.value,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  getHistoricalData(
    startTime: number,
    endTime: number,
    deviceId?: string,
    area?: string,
    limit: number = 10000
  ): SecurityData[] {
    let sql = `
      SELECT d.*, dev.type as device_type, a.code as area_code
      FROM security_data d
      JOIN devices dev ON d.device_id = dev.id
      JOIN areas a ON dev.area_code = a.code
      WHERE d.timestamp >= ? AND d.timestamp <= ?
    `;
    const params: any[] = [startTime, endTime];

    if (deviceId) {
      sql += ' AND d.device_id = ?';
      params.push(deviceId);
    }
    if (area) {
      sql += ' AND a.code = ?';
      params.push(area);
    }

    sql += ' ORDER BY d.timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      deviceId: row.device_id,
      deviceType: row.device_type,
      timestamp: row.timestamp,
      location: {
        lat: row.lat,
        lng: row.lng,
        area: row.area_code
      },
      value: row.value,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  getDevices(): Device[] {
    const cached = deviceCache.get('all_devices');
    if (cached) return cached;

    const rows = db.prepare(`
      SELECT d.*, a.name as area_name
      FROM devices d
      JOIN areas a ON d.area_code = a.code
      ORDER BY d.type, d.name
    `).all() as any[];

    const result = rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      areaCode: row.area_code,
      lat: row.lat,
      lng: row.lng,
      status: row.status,
      createdAt: row.created_at
    }));

    deviceCache.set('all_devices', result);
    return result;
  }

  getDeviceById(id: string): Device | null {
    const row = db.prepare(`
      SELECT d.*, a.name as area_name
      FROM devices d
      JOIN areas a ON d.area_code = a.code
      WHERE d.id = ?
    `).get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      areaCode: row.area_code,
      lat: row.lat,
      lng: row.lng,
      status: row.status,
      createdAt: row.created_at
    };
  }

  getAreas(): Area[] {
    const rows = db.prepare('SELECT * FROM areas ORDER BY name').all() as any[];
    return rows.map(row => ({
      code: row.code,
      name: row.name,
      parentCode: row.parent_code,
      boundary: row.boundary
    }));
  }

  getHeatmapData(timeRange: TimeRange, area?: string, deviceType?: string): Array<{ lat: number; lng: number; value: number; timestamp: number }> {
    const now = Date.now();
    const rangeMs = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    }[timeRange];

    const startTime = now - rangeMs;

    let sql = `
      SELECT sd.lat, sd.lng, sd.value, sd.timestamp
      FROM security_data sd
      JOIN devices dev ON sd.device_id = dev.id
      WHERE sd.timestamp >= ?
    `;
    const params: any[] = [startTime];

    if (area) {
      sql += ' AND dev.area_code = ?';
      params.push(area);
    }
    if (deviceType) {
      sql += ' AND dev.type = ?';
      params.push(deviceType);
    }

    sql += ' ORDER BY sd.timestamp DESC LIMIT 5000';

    return db.prepare(sql).all(...params) as Array<{ lat: number; lng: number; value: number; timestamp: number }>;
  }

  getDataCountByStatus(startTime?: number, endTime?: number): { normal: number; warning: number; danger: number } {
    const cacheKey = `status_${startTime || 0}_${endTime || 0}`;
    const cached = statusCountCache.get(cacheKey);
    if (cached) return cached;

    let sql = `
      SELECT status, COUNT(*) as count
      FROM security_data
    `;
    const params: any[] = [];

    if (startTime && endTime) {
      sql += ' WHERE timestamp >= ? AND timestamp <= ?';
      params.push(startTime, endTime);
    }

    sql += ' GROUP BY status';

    const rows = db.prepare(sql).all(...params) as Array<{ status: string; count: number }>;

    const result = { normal: 0, warning: 0, danger: 0 };
    rows.forEach(row => {
      if (row.status in result) {
        result[row.status as keyof typeof result] = row.count;
      }
    });

    statusCountCache.set(cacheKey, result);
    return result;
  }
}

export const dataRepository = new DataRepository();
export default dataRepository;
