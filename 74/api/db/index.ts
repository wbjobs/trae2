import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'security.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('cache_size = -20000');
db.pragma('temp_store = MEMORY');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS areas (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_code TEXT,
      boundary TEXT,
      FOREIGN KEY (parent_code) REFERENCES areas(code)
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('camera', 'access', 'alarm')),
      area_code TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (area_code) REFERENCES areas(code)
    );

    CREATE TABLE IF NOT EXISTS security_data (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      timestamp BIGINT NOT NULL,
      value REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'normal',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      metadata TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    CREATE INDEX IF NOT EXISTS idx_data_timestamp ON security_data(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_data_device ON security_data(device_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_data_status ON security_data(status, timestamp);
    CREATE INDEX IF NOT EXISTS idx_data_latlng ON security_data(lat, lng);

    CREATE TABLE IF NOT EXISTS anomaly_clusters (
      id TEXT PRIMARY KEY,
      cluster_number INTEGER NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      start_time BIGINT NOT NULL,
      end_time BIGINT NOT NULL,
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS anomaly_alerts (
      id TEXT PRIMARY KEY,
      data_id TEXT NOT NULL,
      cluster_id TEXT,
      level TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (data_id) REFERENCES security_data(id),
      FOREIGN KEY (cluster_id) REFERENCES anomaly_clusters(id)
    );

    CREATE TABLE IF NOT EXISTS risk_records (
      id TEXT PRIMARY KEY,
      area_code TEXT NOT NULL,
      time_period TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      alert_count INTEGER NOT NULL DEFAULT 0,
      device_health REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (area_code) REFERENCES areas(code)
    );

    CREATE INDEX IF NOT EXISTS idx_risk_area_time ON risk_records(area_code, time_period);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON anomaly_alerts(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_level ON anomaly_alerts(level, created_at);
    CREATE INDEX IF NOT EXISTS idx_clusters_time ON anomaly_clusters(start_time, end_time);
  `);

  const areaCount = db.prepare('SELECT COUNT(*) as count FROM areas').get() as { count: number };
  if (areaCount.count === 0) {
    const insertArea = db.prepare('INSERT OR IGNORE INTO areas (code, name, parent_code) VALUES (?, ?, ?)');
    insertArea.run('A01', '东城区', null);
    insertArea.run('A02', '西城区', null);
    insertArea.run('A03', '朝阳区', null);
    insertArea.run('A04', '海淀区', null);
    insertArea.run('A05', '丰台区', null);
  }

  const deviceCount = db.prepare('SELECT COUNT(*) as count FROM devices').get() as { count: number };
  if (deviceCount.count === 0) {
    const insertDevice = db.prepare(`
      INSERT OR IGNORE INTO devices (id, name, type, area_code, lat, lng, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertDevice.run('CAM001', '东大街摄像头', 'camera', 'A01', 39.92, 116.41, 'online');
    insertDevice.run('CAM002', '西站北广场', 'camera', 'A02', 39.90, 116.32, 'online');
    insertDevice.run('CAM003', '国贸商圈', 'camera', 'A03', 39.91, 116.46, 'online');
    insertDevice.run('CAM004', '中关村路口', 'camera', 'A04', 39.98, 116.31, 'online');
    insertDevice.run('CAM005', '南站出口', 'camera', 'A05', 39.87, 116.38, 'online');
    insertDevice.run('ACC001', '市政府门禁', 'access', 'A01', 39.92, 116.40, 'online');
    insertDevice.run('ACC002', '金融街入口', 'access', 'A02', 39.91, 116.35, 'online');
    insertDevice.run('ACC003', '科技园门禁', 'access', 'A04', 39.97, 116.33, 'online');
    insertDevice.run('ALM001', '东单报警器', 'alarm', 'A01', 39.91, 116.42, 'online');
    insertDevice.run('ALM002', '西单报警器', 'alarm', 'A02', 39.91, 116.37, 'online');
    insertDevice.run('ALM003', 'CBD报警器', 'alarm', 'A03', 39.92, 116.45, 'online');
    insertDevice.run('ALM004', '五道口报警器', 'alarm', 'A04', 39.99, 116.34, 'online');
  }
}

export default db;
