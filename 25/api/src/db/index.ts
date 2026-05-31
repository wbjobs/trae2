import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import schemaSQL from './schema.js'

type SqlJsDatabase = initSqlJs.Database

let db: SqlJsDatabase | null = null
let SQL: initSqlJs.SqlJsStatic | null = null

export async function getDatabase(): Promise<SqlJsDatabase> {
  if (db && SQL) {
    return db
  }

  SQL = await initSqlJs()

  const dbDir = path.dirname(config.db.path)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  if (fs.existsSync(config.db.path)) {
    const fileBuffer = fs.readFileSync(config.db.path)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(schemaSQL)
  saveDatabase()

  return db
}

export function saveDatabase(): void {
  if (!db || !SQL) return
  const data = db.export()
  const buffer = Buffer.from(data)
  const dbDir = path.dirname(config.db.path)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  fs.writeFileSync(config.db.path, buffer)
}

export function query(
  sql: string,
  params: Record<string, any> = {}
): any[] {
  if (!db) throw new Error('Database not initialized')
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const results: any[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

export function queryOne(
  sql: string,
  params: Record<string, any> = {}
): any | null {
  const results = query(sql, params)
  return results.length > 0 ? results[0] : null
}

export function execute(
  sql: string,
  params: Record<string, any> = {}
): number {
  if (!db) throw new Error('Database not initialized')
  db.run(sql, params)
  saveDatabase()
  return db.getRowsModified()
}

export function getLastInsertId(): number {
  if (!db) throw new Error('Database not initialized')
  const result = queryOne('SELECT last_insert_rowid() as id')
  return result ? result.id : 0
}
