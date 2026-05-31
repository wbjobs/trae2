/**
 * 数据库初始化模块
 * 使用 sql.js (SQLite WebAssembly 版本) 初始化数据库
 * 包含: 信令表(signaling)、链路表(links)、车站表(stations)、日志表(audit_logs)
 * sql.js 为纯 JS 实现，无需原生编译
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'signaling.db');
const dataDir = path.join(__dirname, '..', 'data');

let db = null;
let SQL = null;
let pendingChanges = 0;
const AUTO_SAVE_THRESHOLD = 100;
let saveTimer = null;
const AUTO_SAVE_INTERVAL = 5000;

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadDatabase() {
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    return new SQL.Database(fileBuffer);
  }
  return new SQL.Database();
}

function saveDatabase(immediate = false) {
  if (!db) return;

  if (!immediate) {
    pendingChanges++;
    if (pendingChanges < AUTO_SAVE_THRESHOLD) {
      if (!saveTimer) {
        saveTimer = setTimeout(() => saveDatabase(true), AUTO_SAVE_INTERVAL);
      }
      return;
    }
  }

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  pendingChanges = 0;
  ensureDataDir();
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function forceSave() {
  saveDatabase(true);
}

async function initDatabase() {
  SQL = await initSqlJs();
  ensureDataDir();
  db = loadDatabase();

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS stations (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      line          TEXT NOT NULL,
      level         INTEGER DEFAULT 1,
      status        TEXT DEFAULT 'online',
      ip_address    TEXT,
      last_heartbeat TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS links (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      src_station     TEXT NOT NULL,
      dst_station     TEXT NOT NULL,
      link_type       TEXT NOT NULL,
      status          TEXT DEFAULT 'normal',
      latency         INTEGER DEFAULT 0,
      bandwidth       INTEGER DEFAULT 1000,
      packet_loss     REAL DEFAULT 0,
      last_heartbeat  TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS signaling (
      id            TEXT PRIMARY KEY,
      type          TEXT NOT NULL,
      protocol      TEXT NOT NULL,
      src_station   TEXT,
      dst_station   TEXT,
      src_device    TEXT,
      dst_device    TEXT,
      timestamp     TEXT NOT NULL,
      raw_data      TEXT,
      parsed_data   TEXT,
      severity      TEXT DEFAULT 'info',
      direction     TEXT DEFAULT 'bidirectional',
      processed     INTEGER DEFAULT 0,
      retry_count   INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          TEXT PRIMARY KEY,
      action      TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id   TEXT,
      operator    TEXT DEFAULT 'system',
      detail      TEXT,
      timestamp   TEXT NOT NULL
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_signaling_type ON signaling(type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_signaling_timestamp ON signaling(timestamp)');
  db.run('CREATE INDEX IF NOT EXISTS idx_signaling_protocol ON signaling(protocol)');
  db.run('CREATE INDEX IF NOT EXISTS idx_signaling_severity ON signaling(severity)');
  db.run('CREATE INDEX IF NOT EXISTS idx_links_status ON links(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)');

  saveDatabase();
}

function queryAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params) {
  if (params && params.length > 0) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
}

function insertStation(station) {
  execute(
    `INSERT OR REPLACE INTO stations (id, name, line, level, status, ip_address, last_heartbeat)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [station.id, station.name, station.line, station.level, station.status, station.ip_address, station.last_heartbeat]
  );
  saveDatabase();
}

function insertLink(link) {
  execute(
    `INSERT OR REPLACE INTO links (id, name, src_station, dst_station, link_type, status, latency, bandwidth, packet_loss, last_heartbeat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [link.id, link.name, link.src_station, link.dst_station, link.link_type, link.status, link.latency, link.bandwidth, link.packet_loss, link.last_heartbeat]
  );
  saveDatabase();
}

function insertSignaling(signal) {
  execute(
    `INSERT OR REPLACE INTO signaling (id, type, protocol, src_station, dst_station, src_device, dst_device, timestamp, raw_data, parsed_data, severity, direction, retry_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [signal.id, signal.type, signal.protocol, signal.src_station, signal.dst_station, signal.src_device, signal.dst_device, signal.timestamp, signal.raw_data, signal.parsed_data, signal.severity, signal.direction, signal.retry_count || 0]
  );
  saveDatabase();
}

function batchInsertSignaling(signals) {
  if (!signals || signals.length === 0) return 0;

  db.run('BEGIN TRANSACTION');
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO signaling (id, type, protocol, src_station, dst_station, src_device, dst_device, timestamp, raw_data, parsed_data, severity, direction, retry_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let count = 0;
  for (const signal of signals) {
    stmt.run([
      signal.id, signal.type, signal.protocol, signal.src_station, signal.dst_station,
      signal.src_device, signal.dst_device, signal.timestamp, signal.raw_data,
      signal.parsed_data, signal.severity, signal.direction, signal.retry_count || 0
    ]);
    count++;
  }

  stmt.free();
  db.run('COMMIT');
  saveDatabase();
  return count;
}

function batchUpdateStationHeartbeats(stationIds) {
  if (!stationIds || stationIds.length === 0) return 0;

  db.run('BEGIN TRANSACTION');
  const stmt = db.prepare("UPDATE stations SET last_heartbeat = datetime('now'), status = 'online' WHERE id = ?");

  let count = 0;
  for (const id of stationIds) {
    stmt.run([id]);
    count++;
  }

  stmt.free();
  db.run('COMMIT');
  saveDatabase();
  return count;
}

function batchUpdateLinkStatuses(linkUpdates) {
  if (!linkUpdates || linkUpdates.length === 0) return 0;

  db.run('BEGIN TRANSACTION');
  const stmt = db.prepare(
    `UPDATE links SET status = ?, latency = ?, packet_loss = ?, last_heartbeat = ?, updated_at = datetime('now') WHERE id = ?`
  );

  let count = 0;
  for (const update of linkUpdates) {
    stmt.run([
      update.status, update.latency, update.packet_loss, update.last_heartbeat, update.id
    ]);
    count++;
  }

  stmt.free();
  db.run('COMMIT');
  saveDatabase();
  return count;
}

function insertAuditLog(log) {
  execute(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, operator, detail, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [log.id, log.action, log.entity_type, log.entity_id, log.operator, log.detail, log.timestamp]
  );
  saveDatabase();
}

function updateLinkStatus(linkId, status, extraParams = {}) {
  const setClauses = ['status = ?', "updated_at = datetime('now')"];
  const values = [status];

  if (extraParams.latency !== undefined) {
    setClauses.push('latency = ?');
    values.push(extraParams.latency);
  }
  if (extraParams.packet_loss !== undefined) {
    setClauses.push('packet_loss = ?');
    values.push(extraParams.packet_loss);
  }
  if (extraParams.last_heartbeat !== undefined) {
    setClauses.push('last_heartbeat = ?');
    values.push(extraParams.last_heartbeat);
  }

  values.push(linkId);

  const sql = `UPDATE links SET ${setClauses.join(', ')} WHERE id = ?`;
  execute(sql, values);
  saveDatabase();
}

function getAllStations() {
  return queryAll('SELECT * FROM stations ORDER BY line, name');
}

function getStationById(id) {
  return queryOne('SELECT * FROM stations WHERE id = ?', [id]);
}

function getAllLinks() {
  return queryAll('SELECT * FROM links ORDER BY name');
}

function getLinkById(id) {
  return queryOne('SELECT * FROM links WHERE id = ?', [id]);
}

function getSignaling(params = {}) {
  const conditions = [];
  const values = [];

  if (params.type) { conditions.push('type = ?'); values.push(params.type); }
  if (params.protocol) { conditions.push('protocol = ?'); values.push(params.protocol); }
  if (params.severity) { conditions.push('severity = ?'); values.push(params.severity); }
  if (params.src_station) { conditions.push('src_station = ?'); values.push(params.src_station); }

  let sql = 'SELECT * FROM signaling';
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  values.push(params.limit || 100);
  values.push(params.offset || 0);

  return queryAll(sql, values);
}

function getSignalingById(id) {
  return queryOne('SELECT * FROM signaling WHERE id = ?', [id]);
}

function getSignalingStats() {
  return queryAll(`
    SELECT
      type,
      protocol,
      severity,
      COUNT(*) as count
    FROM signaling
    GROUP BY type, protocol, severity
    ORDER BY count DESC
  `);
}

function updateStationHeartbeat(stationId) {
  execute("UPDATE stations SET last_heartbeat = datetime('now'), status = 'online' WHERE id = ?", [stationId]);
  saveDatabase();
}

function close() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  insertStation,
  insertLink,
  insertSignaling,
  batchInsertSignaling,
  batchUpdateStationHeartbeats,
  batchUpdateLinkStatuses,
  insertAuditLog,
  updateLinkStatus,
  updateStationHeartbeat,
  getAllStations,
  getStationById,
  getAllLinks,
  getLinkById,
  getSignaling,
  getSignalingById,
  getSignalingStats,
  forceSave,
  close,
};