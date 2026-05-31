import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
  });

  const dbPath = path.join(__dirname, '..', '..', 'data', 'bridge.db');
  
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    createTables(db);
    insertMockData(db);
    saveDatabase(db);
  }

  return db;
}

function createTables(db: Database): void {
  db.run(`
    CREATE TABLE bridges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      model_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE layers (
      id TEXT PRIMARY KEY,
      bridge_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      visible BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bridge_id) REFERENCES bridges(id)
    )
  `);

  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'engineer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE defects (
      id TEXT PRIMARY KEY,
      bridge_id TEXT NOT NULL,
      layer_id TEXT,
      creator_id TEXT,
      position_x REAL NOT NULL,
      position_y REAL NOT NULL,
      position_z REAL NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bridge_id) REFERENCES bridges(id),
      FOREIGN KEY (layer_id) REFERENCES layers(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE stress_results (
      id TEXT PRIMARY KEY,
      bridge_id TEXT NOT NULL,
      element_id TEXT NOT NULL,
      max_stress REAL NOT NULL,
      min_stress REAL NOT NULL,
      stress_distribution TEXT NOT NULL,
      analysis_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bridge_id) REFERENCES bridges(id)
    )
  `);
}

function insertMockData(db: Database): void {
  db.run(`
    INSERT INTO bridges (id, name, description, model_url) VALUES
    ('bridge-001', '长江大桥', '主跨1200米的悬索桥，建于2010年', '/models/bridge-001.glb'),
    ('bridge-002', '黄河大桥', '主跨600米的斜拉桥，建于2015年', '/models/bridge-002.glb')
  `);

  db.run(`
    INSERT INTO layers (id, bridge_id, name, color, visible) VALUES
    ('layer-001', 'bridge-001', '裂纹检测', '#EF4444', 1),
    ('layer-002', 'bridge-001', '腐蚀检测', '#F59E0B', 1),
    ('layer-003', 'bridge-001', '变形监测', '#3B82F6', 1),
    ('layer-004', 'bridge-002', '裂纹检测', '#EF4444', 1),
    ('layer-005', 'bridge-002', '剥落检测', '#8B5CF6', 1)
  `);

  db.run(`
    INSERT INTO users (id, username, email, password_hash, role) VALUES
    ('user-001', 'admin', 'admin@bridge.com', 'admin123', 'admin'),
    ('user-002', 'engineer1', 'eng1@bridge.com', 'eng123', 'engineer')
  `);

  const defects = [
    ['defect-001', 'bridge-001', 'layer-001', 'user-002', 5.0, -0.2, 0.8, 'crack', 'high', '主梁底部发现0.3米长横向裂纹'],
    ['defect-002', 'bridge-001', 'layer-001', 'user-002', -16.0, 5.0, 0.5, 'crack', 'medium', '桥塔中部竖向裂纹'],
    ['defect-003', 'bridge-001', 'layer-002', 'user-002', 10.0, 0.4, 1.5, 'corrosion', 'low', '钢箱梁表面轻微锈蚀'],
    ['defect-004', 'bridge-001', 'layer-003', 'user-002', 0, 5.5, 0, 'deformation', 'high', '吊索连接处异常位移'],
    ['defect-005', 'bridge-001', 'layer-001', 'user-002', 16.0, 8.0, 0.3, 'crack', 'critical', '桥面铺装层严重开裂'],
    ['defect-006', 'bridge-001', 'layer-002', 'user-002', -8.0, 0.6, -0.8, 'corrosion', 'medium', '混凝土保护层剥落'],
  ];

  defects.forEach(([id, bridgeId, layerId, creatorId, x, y, z, type, severity, desc]) => {
    db.run(
      `INSERT INTO defects (id, bridge_id, layer_id, creator_id, position_x, position_y, position_z, type, severity, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, bridgeId, layerId, creatorId, x, y, z, type, severity, desc]
    );
  });

  const stressDist1 = JSON.stringify(Array.from({ length: 100 }, () => Math.random() * 80 + 20));
  const stressDist2 = JSON.stringify(Array.from({ length: 100 }, () => Math.random() * 60 + 10));

  db.run(
    `INSERT INTO stress_results (id, bridge_id, element_id, max_stress, min_stress, stress_distribution) VALUES
     ('stress-001', 'bridge-001', 'elem-main-girder', 95.5, 25.3, ?),
     ('stress-002', 'bridge-001', 'elem-tower', 78.2, 15.8, ?),
     ('stress-003', 'bridge-002', 'elem-cable-stay', 120.1, 40.2, ?)`,
    [stressDist1, stressDist2, stressDist1]
  );
}

export function saveDatabase(db: Database): void {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(path.join(dataDir, 'bridge.db'), buffer);
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}
