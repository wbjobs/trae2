import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_URL || './forest.db';
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initializeDatabase(db);
  }

  return db;
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      code TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scientific_name TEXT NOT NULL,
      category_id TEXT,
      family TEXT,
      genus TEXT,
      species TEXT,
      description TEXT,
      origin TEXT,
      habitat TEXT,
      protection_level TEXT,
      latitude REAL,
      longitude REAL,
      altitude REAL,
      address TEXT,
      province TEXT,
      city TEXT,
      district TEXT,
      surveyor TEXT,
      survey_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS growth_records (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      record_date TEXT NOT NULL,
      height_cm REAL,
      dbh_cm REAL,
      crown_width_m REAL,
      health_status TEXT,
      phenology TEXT,
      notes TEXT,
      recorder TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS field_images (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      description TEXT,
      taken_date TEXT,
      location TEXT,
      photographer TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category_id);
    CREATE INDEX IF NOT EXISTS idx_resources_name ON resources(name);
    CREATE INDEX IF NOT EXISTS idx_resources_scientific ON resources(scientific_name);
    CREATE INDEX IF NOT EXISTS idx_resources_province ON resources(province);
    CREATE INDEX IF NOT EXISTS idx_resources_family ON resources(family);
    CREATE INDEX IF NOT EXISTS idx_resources_protection ON resources(protection_level);
    CREATE INDEX IF NOT EXISTS idx_resources_coords ON resources(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_growth_records_resource ON growth_records(resource_id);
    CREATE INDEX IF NOT EXISTS idx_growth_records_date ON growth_records(record_date);
    CREATE INDEX IF NOT EXISTS idx_growth_records_resource_date ON growth_records(resource_id, record_date);
    CREATE INDEX IF NOT EXISTS idx_field_images_resource ON field_images(resource_id);
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_code ON categories(code);
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
