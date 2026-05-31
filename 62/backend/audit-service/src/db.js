/**
 * SQLite 数据库模块（基于 sql.js 纯 JavaScript 版本）
 *
 * 功能:
 * - 初始化 audit_logs 表
 * - 提供日志增删改查操作
 * - 导出数据库快照持久化
 */

const initSqlJs = require('sql.js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'audit.db');

let db = null;
let SQL = null;

/**
 * 初始化数据库
 */
async function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] 已从文件加载数据库');
  } else {
    db = new SQL.Database();
    console.log('[DB] 已创建新数据库');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      operator TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      source_ip TEXT,
      level TEXT NOT NULL DEFAULT 'info',
      status TEXT NOT NULL DEFAULT 'success'
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)');
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_operator ON audit_logs(operator)');
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)');
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_level ON audit_logs(level)');

  console.log('[DB] audit_logs 表初始化完成');
  return db;
}

/**
 * 持久化数据库到文件
 */
function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('[DB] 保存数据库失败:', err.message);
  }
}

/**
 * 写入审计日志
 */
function insertLog(log) {
  const id = log.id || uuidv4();
  const timestamp = log.timestamp || new Date().toISOString();
  const operator = log.operator || 'system';
  const action = log.action || 'unknown';
  const target = log.target || '';
  const details = log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)) : '';
  const sourceIp = log.source_ip || '127.0.0.1';
  const level = log.level || 'info';
  const status = log.status || 'success';

  db.run(
    'INSERT INTO audit_logs (id, timestamp, operator, action, target, details, source_ip, level, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, timestamp, operator, action, target, details, sourceIp, level, status]
  );

  return { id, timestamp, operator, action, target, details, source_ip: sourceIp, level, status };
}

/**
 * 分页查询日志
 */
function queryLogs(filters = {}) {
  const {
    operator,
    action,
    level,
    startTime,
    endTime,
    page = 1,
    pageSize = 20,
  } = filters;

  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (operator) {
    sql += ' AND operator LIKE ?';
    params.push(`%${operator}%`);
  }
  if (action) {
    sql += ' AND action LIKE ?';
    params.push(`%${action}%`);
  }
  if (level) {
    sql += ' AND level = ?';
    params.push(level);
  }
  if (startTime) {
    sql += ' AND timestamp >= ?';
    params.push(startTime);
  }
  if (endTime) {
    sql += ' AND timestamp <= ?';
    params.push(endTime);
  }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
  const countResult = db.exec(countSql, params);
  const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);

  const result = db.exec(sql, params);
  const logs = result.length > 0 ? rowsToObjects(result[0]) : [];

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 根据 ID 查询单条日志
 */
function getLogById(id) {
  const result = db.exec('SELECT * FROM audit_logs WHERE id = ?', [id]);
  if (result.length === 0) return null;
  return rowsToObjects(result[0])[0];
}

/**
 * 日志统计（按操作类型/级别/时段分组）
 */
function getStats(startTime, endTime) {
  let timeFilter = '';
  const params = [];
  if (startTime) {
    timeFilter += ' AND timestamp >= ?';
    params.push(startTime);
  }
  if (endTime) {
    timeFilter += ' AND timestamp <= ?';
    params.push(endTime);
  }

  const totalResult = db.exec(
    `SELECT COUNT(*) as count FROM audit_logs WHERE 1=1 ${timeFilter}`,
    params
  );
  const total = totalResult.length > 0 ? totalResult[0].values[0][0] : 0;

  const byActionResult = db.exec(
    `SELECT action, COUNT(*) as count, level, status
     FROM audit_logs
     WHERE 1=1 ${timeFilter}
     GROUP BY action, level, status
     ORDER BY count DESC`,
    params
  );
  const byAction = byActionResult.length > 0 ? rowsToObjects(byActionResult[0]) : [];

  const byLevelResult = db.exec(
    `SELECT level, COUNT(*) as count
     FROM audit_logs
     WHERE 1=1 ${timeFilter}
     GROUP BY level
     ORDER BY count DESC`,
    params
  );
  const byLevel = byLevelResult.length > 0 ? rowsToObjects(byLevelResult[0]) : [];

  const byHourResult = db.exec(
    `SELECT substr(timestamp, 1, 13) as hour, COUNT(*) as count
     FROM audit_logs
     WHERE 1=1 ${timeFilter}
     GROUP BY substr(timestamp, 1, 13)
     ORDER BY hour DESC
     LIMIT 24`,
    params
  );
  const byHour = byHourResult.length > 0 ? rowsToObjects(byHourResult[0]) : [];

  const byStatusResult = db.exec(
    `SELECT status, COUNT(*) as count
     FROM audit_logs
     WHERE 1=1 ${timeFilter}
     GROUP BY status`,
    params
  );
  const byStatus = byStatusResult.length > 0 ? rowsToObjects(byStatusResult[0]) : [];

  return {
    total,
    byAction,
    byLevel,
    byStatus,
    byHour,
  };
}

/**
 * 导出日志（JSON 格式）
 */
function exportLogs(filters = {}) {
  const { operator, action, level, startTime, endTime } = filters;

  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (operator) {
    sql += ' AND operator LIKE ?';
    params.push(`%${operator}%`);
  }
  if (action) {
    sql += ' AND action LIKE ?';
    params.push(`%${action}%`);
  }
  if (level) {
    sql += ' AND level = ?';
    params.push(level);
  }
  if (startTime) {
    sql += ' AND timestamp >= ?';
    params.push(startTime);
  }
  if (endTime) {
    sql += ' AND timestamp <= ?';
    params.push(endTime);
  }

  sql += ' ORDER BY timestamp DESC';

  const result = db.exec(sql, params);
  return result.length > 0 ? rowsToObjects(result[0]) : [];
}

/**
 * 将 sql.js 结果转换为对象数组
 */
function rowsToObjects(result) {
  const { columns, values } = result;
  return values.map(row => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    if (obj.details) {
      try {
        obj.details = JSON.parse(obj.details);
      } catch (e) {
        // details 非 JSON 字符串则保留原值
      }
    }
    return obj;
  });
}

/**
 * 获取所有日志
 */
function getAllLogs() {
  const result = db.exec('SELECT * FROM audit_logs ORDER BY timestamp DESC');
  return result.length > 0 ? rowsToObjects(result[0]) : [];
}

/**
 * 关闭数据库
 */
function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    console.log('[DB] 数据库已关闭');
  }
}

module.exports = {
  initDatabase,
  saveDatabase,
  insertLog,
  queryLogs,
  getLogById,
  getStats,
  exportLogs,
  getAllLogs,
  closeDatabase,
};