const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'germplasm.db');
const dbBackupPath = path.join(__dirname, '..', 'germplasm.db.backup');

let dbWrapper = null;
let saveQueue = Promise.resolve();
let pendingWrites = 0;

function safeSave(database) {
  pendingWrites++;
  saveQueue = saveQueue.then(() => {
    try {
      if (fs.existsSync(dbPath)) {
        try { fs.copyFileSync(dbPath, dbBackupPath); } catch (e) {}
      }
      const data = database.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (e) {
      console.error('数据库保存失败:', e.message);
    } finally {
      pendingWrites--;
    }
  });
  return saveQueue;
}

function createWrapper(database) {
  function prepare(sql) {
    return {
      run(...params) {
        const stmt = database.prepare(sql);
        try {
          if (params.length > 0) {
            stmt.bind(params);
          }
          stmt.step();
        } finally {
          try { stmt.free(); } catch (e) {}
        }
        safeSave(database);
        let lastId = null;
        try {
          const res = database.exec('SELECT last_insert_rowid() as id');
          lastId = res.length > 0 && res[0].values.length > 0 ? res[0].values[0][0] : null;
        } catch (e) {}
        return { changes: database.getRowsModified(), lastInsertRowid: lastId };
      },
      runAndReturnId(...params) {
        const stmt = database.prepare(sql);
        try {
          if (params.length > 0) {
            stmt.bind(params);
          }
          stmt.step();
        } finally {
          try { stmt.free(); } catch (e) {}
        }
        let lastId = null;
        try {
          const res = database.exec('SELECT last_insert_rowid() as id');
          lastId = res.length > 0 && res[0].values.length > 0 ? res[0].values[0][0] : null;
        } catch (e) {}
        return { changes: database.getRowsModified(), lastInsertRowid: lastId };
      },
      get(...params) {
        const stmt = database.prepare(sql);
        let result = null;
        try {
          if (params.length > 0) {
            stmt.bind(params);
          }
          if (stmt.step()) {
            result = stmt.getAsObject();
          }
        } finally {
          try { stmt.free(); } catch (e) {}
        }
        return result;
      },
      all(...params) {
        const results = [];
        const stmt = database.prepare(sql);
        try {
          if (params.length > 0) {
            stmt.bind(params);
          }
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
        } finally {
          try { stmt.free(); } catch (e) {}
        }
        return results;
      }
    };
  }

  return {
    prepare,
    exec(sql) {
      database.exec(sql);
      safeSave(database);
    },
    execWithoutSave(sql) {
      database.exec(sql);
    },
    pragma(sql) {
      try { database.run('PRAGMA ' + sql); } catch (e) {}
    },
    save() {
      return safeSave(database);
    },
    forceSave() {
      safeSave(database);
      return saveQueue;
    },
    beginTransaction() {
      database.run('BEGIN TRANSACTION');
    },
    commit() {
      database.run('COMMIT');
      safeSave(database);
    },
    rollback() {
      try { database.run('ROLLBACK'); } catch (e) {}
    },
    close() {
      safeSave(database);
      saveQueue.then(() => {
        try { database.close(); } catch (e) {}
      });
    },
    getPendingWrites() {
      return pendingWrites;
    }
  };
}

async function initDatabase() {
  const SQL = await initSqlJs();

  let existingData = null;
  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      existingData = new Uint8Array(fileBuffer);
      console.log('从现有数据库文件加载:', dbPath);
    } catch (e) {
      console.warn('读取数据库失败，尝试从备份恢复:', e.message);
      if (fs.existsSync(dbBackupPath)) {
        try {
          const backupBuffer = fs.readFileSync(dbBackupPath);
          existingData = new Uint8Array(backupBuffer);
          console.log('从备份恢复成功');
        } catch (be) {
          console.error('备份也无法读取，创建新数据库');
        }
      }
    }
  }

  const database = new SQL.Database(existingData);

  database.run(`
    CREATE TABLE IF NOT EXISTS classifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      parent_id INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS germplasm (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      english_name TEXT,
      classification_id INTEGER,
      source TEXT,
      origin TEXT,
      origin_latitude REAL,
      origin_longitude REAL,
      origin_address TEXT,
      material_type TEXT,
      breeding_method TEXT,
      year_collected INTEGER,
      collector TEXT,
      conservation_method TEXT,
      conservation_location TEXT,
      biological_status TEXT,
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS traits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      germplasm_id INTEGER NOT NULL,
      trait_name TEXT NOT NULL,
      trait_category TEXT,
      trait_value TEXT NOT NULL,
      trait_unit TEXT,
      observation_date TEXT,
      observer TEXT,
      field_location TEXT,
      latitude REAL,
      longitude REAL,
      growth_stage TEXT,
      environment TEXT,
      notes TEXT,
      images TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS field_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      germplasm_id INTEGER,
      trait_id INTEGER,
      filename TEXT NOT NULL,
      original_name TEXT,
      filepath TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      image_type TEXT,
      shoot_date TEXT,
      shoot_location TEXT,
      latitude REAL,
      longitude REAL,
      photographer TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  try {
    database.run('CREATE INDEX IF NOT EXISTS idx_germplasm_classification ON germplasm(classification_id)');
    database.run('CREATE INDEX IF NOT EXISTS idx_traits_germplasm ON traits(germplasm_id)');
    database.run('CREATE INDEX IF NOT EXISTS idx_field_images_germplasm ON field_images(germplasm_id)');
    database.run('CREATE INDEX IF NOT EXISTS idx_field_images_trait ON field_images(trait_id)');
    database.run('CREATE INDEX IF NOT EXISTS idx_classifications_parent ON classifications(parent_id)');
    database.run('CREATE INDEX IF NOT EXISTS idx_germplasm_resource_no ON germplasm(resource_no)');
    database.run('CREATE INDEX IF NOT EXISTS idx_traits_category ON traits(trait_category)');
    database.run('CREATE INDEX IF NOT EXISTS idx_field_images_type ON field_images(image_type)');
    
    database.run('CREATE INDEX IF NOT EXISTS idx_germplasm_status ON germplasm(status)');
    database.run('CREATE INDEX IF NOT EXISTS idx_germplasm_material_type ON germplasm(material_type)');
    database.run('CREATE INDEX IF NOT EXISTS idx_germplasm_origin ON germplasm(origin)');
    database.run('CREATE INDEX IF NOT EXISTS idx_germplasm_year ON germplasm(year_collected)');
    database.run('CREATE INDEX IF NOT EXISTS idx_traits_observation_date ON traits(observation_date)');
    database.run('CREATE INDEX IF NOT EXISTS idx_traits_name ON traits(trait_name)');
    database.run('CREATE INDEX IF NOT EXISTS idx_germplasm_created_at ON germplasm(created_at)');
    database.run('CREATE INDEX IF NOT EXISTS idx_traits_created_at ON traits(created_at)');
    
    database.run('CREATE INDEX IF NOT EXISTS idx_germplasm_location ON germplasm(origin_latitude, origin_longitude) WHERE origin_latitude IS NOT NULL AND origin_longitude IS NOT NULL');
    
    database.run('ANALYZE');
  } catch (e) { console.warn('索引创建跳过:', e.message); }

  dbWrapper = createWrapper(database);
  await dbWrapper.forceSave();

  setInterval(() => {
    if (pendingWrites > 0) {
      console.log(`自动保存数据库，待写入: ${pendingWrites}`);
    }
  }, 30000);

  console.log('数据库初始化完成:', dbPath);
  return dbWrapper;
}

function getDb() {
  return dbWrapper;
}

async function waitForSave() {
  await saveQueue;
}

process.on('SIGINT', async () => {
  console.log('收到退出信号，保存数据库...');
  if (dbWrapper) {
    await dbWrapper.forceSave();
  }
  process.exit(0);
});

module.exports = { initDatabase, getDb, waitForSave };
