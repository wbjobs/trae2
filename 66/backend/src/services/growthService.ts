import { getDatabase } from '../models/database';
import { v4 as uuidv4 } from 'uuid';
import { GrowthRecord } from '../types';

const db = getDatabase();

export interface GrowthRecordQueryParams {
  resource_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export function createGrowthRecord(
  data: Omit<GrowthRecord, 'id' | 'created_at' | 'updated_at'>
): GrowthRecord {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO growth_records (
      id, resource_id, record_date, height_cm, dbh_cm,
      crown_width_m, health_status, phenology, notes,
      recorder, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, data.resource_id, data.record_date,
    data.height_cm, data.dbh_cm, data.crown_width_m,
    data.health_status, data.phenology, data.notes,
    data.recorder, now, now
  );

  return getGrowthRecordById(id) as GrowthRecord;
}

export function getGrowthRecordById(id: string): GrowthRecord | null {
  return db.prepare(`
    SELECT gr.*, r.name as resource_name, r.scientific_name
    FROM growth_records gr
    LEFT JOIN resources r ON gr.resource_id = r.id
    WHERE gr.id = ?
  `).get(id) as GrowthRecord | null;
}

export function getGrowthRecords(params: GrowthRecordQueryParams) {
  const page = params.page || 1;
  const page_size = params.page_size || 20;
  const offset = (page - 1) * page_size;

  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params.resource_id) {
    conditions.push('resource_id = ?');
    queryParams.push(params.resource_id);
  }

  if (params.start_date) {
    conditions.push('record_date >= ?');
    queryParams.push(params.start_date);
  }

  if (params.end_date) {
    conditions.push('record_date <= ?');
    queryParams.push(params.end_date);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM growth_records ${whereClause}`);
  const total = (countStmt.get(...queryParams) as { count: number }).count;

  const stmt = db.prepare(`
    SELECT gr.*, r.name as resource_name, r.scientific_name
    FROM growth_records gr
    LEFT JOIN resources r ON gr.resource_id = r.id
    ${whereClause}
    ORDER BY gr.record_date DESC
    LIMIT ? OFFSET ?
  `);

  const data = stmt.all(...queryParams, page_size, offset);

  return {
    success: true,
    data,
    pagination: {
      page,
      page_size,
      total,
      total_pages: Math.ceil(total / page_size)
    }
  };
}

export function updateGrowthRecord(
  id: string,
  data: Partial<Omit<GrowthRecord, 'id' | 'created_at'>>
): GrowthRecord | null {
  const existing = db.prepare('SELECT * FROM growth_records WHERE id = ?').get(id);
  if (!existing) return null;

  const updateFields: string[] = [];
  const updateValues: any[] = [];

  const allowedFields = [
    'resource_id', 'record_date', 'height_cm', 'dbh_cm',
    'crown_width_m', 'health_status', 'phenology', 'notes', 'recorder'
  ];

  for (const field of allowedFields) {
    if ((data as any)[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      updateValues.push((data as any)[field]);
    }
  }

  updateFields.push('updated_at = ?');
  updateValues.push(new Date().toISOString());
  updateValues.push(id);

  const stmt = db.prepare(`
    UPDATE growth_records SET ${updateFields.join(', ')}
    WHERE id = ?
  `);

  stmt.run(...updateValues);

  return getGrowthRecordById(id);
}

export function deleteGrowthRecord(id: string): boolean {
  const stmt = db.prepare('DELETE FROM growth_records WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getGrowthStats(resourceId: string) {
  const records = db.prepare(`
    SELECT * FROM growth_records
    WHERE resource_id = ?
    ORDER BY record_date ASC
  `).all(resourceId) as GrowthRecord[];

  if (records.length === 0) {
    return {
      total_records: 0,
      first_record: null,
      last_record: null,
      height_change: null,
      dbh_change: null,
      growth_rate_per_year: null
    };
  }

  const firstRecord = records[0];
  const lastRecord = records[records.length - 1];

  const firstDate = new Date(firstRecord.record_date);
  const lastDate = new Date(lastRecord.record_date);
  const yearsDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

  const heightChange = firstRecord.height_cm && lastRecord.height_cm
    ? lastRecord.height_cm - firstRecord.height_cm
    : null;

  const dbhChange = firstRecord.dbh_cm && lastRecord.dbh_cm
    ? lastRecord.dbh_cm - firstRecord.dbh_cm
    : null;

  return {
    total_records: records.length,
    first_record: firstRecord,
    last_record: lastRecord,
    height_change: heightChange,
    dbh_change: dbhChange,
    growth_rate_per_year: yearsDiff > 0 ? {
      height: heightChange ? heightChange / yearsDiff : null,
      dbh: dbhChange ? dbhChange / yearsDiff : null
    } : null
  };
}

export interface YearlyComparisonData {
  year: string;
  record_count: number;
  avg_height_cm: number | null;
  avg_db_hcm: number | null;
  avg_crown_width_m: number | null;
  min_height_cm: number | null;
  max_height_cm: number | null;
  min_db_hcm: number | null;
  max_db_hcm: number | null;
  resources_tracked: number;
}

export function getYearlyComparison(params?: {
  start_year?: number;
  end_year?: number;
  resource_id?: string;
}): YearlyComparisonData[] {
  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params?.start_year) {
    conditions.push('CAST(strftime(\'%Y\', record_date) AS INTEGER) >= ?');
    queryParams.push(params.start_year);
  }

  if (params?.end_year) {
    conditions.push('CAST(strftime(\'%Y\', record_date) AS INTEGER) <= ?');
    queryParams.push(params.end_year);
  }

  if (params?.resource_id) {
    conditions.push('resource_id = ?');
    queryParams.push(params.resource_id);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const stmt = db.prepare(`
    SELECT
      strftime('%Y', record_date) as year,
      COUNT(*) as record_count,
      COUNT(DISTINCT resource_id) as resources_tracked,
      AVG(height_cm) as avg_height_cm,
      AVG(db_hcm) as avg_db_hcm,
      AVG(crown_width_m) as avg_crown_width_m,
      MIN(height_cm) as min_height_cm,
      MAX(height_cm) as max_height_cm,
      MIN(db_hcm) as min_db_hcm,
      MAX(db_hcm) as max_db_hcm
    FROM growth_records
    ${whereClause}
    GROUP BY strftime('%Y', record_date)
    ORDER BY year ASC
  `);

  const results = stmt.all(...queryParams) as any[];

  return results.map(row => ({
    year: row.year,
    record_count: row.record_count,
    resources_tracked: row.resources_tracked,
    avg_height_cm: row.avg_height_cm ? Math.round(row.avg_height_cm * 10) / 10 : null,
    avg_db_hcm: row.avg_db_hcm ? Math.round(row.avg_db_hcm * 10) / 10 : null,
    avg_crown_width_m: row.avg_crown_width_m ? Math.round(row.avg_crown_width_m * 100) / 100 : null,
    min_height_cm: row.min_height_cm,
    max_height_cm: row.max_height_cm,
    min_db_hcm: row.min_db_hcm,
    max_db_hcm: row.max_db_hcm
  }));
}

export interface ResourceGrowthTrend {
  resource_id: string;
  resource_name: string;
  scientific_name: string;
  family: string;
  category: string;
  yearly_data: Array<{
    year: string;
    first_height: number | null;
    last_height: number | null;
    first_dbh: number | null;
    last_dbh: number | null;
    height_growth: number | null;
    dbh_growth: number | null;
  }>;
}

export function getResourceGrowthTrends(params?: {
  limit?: number;
  category_id?: string;
}): ResourceGrowthTrend[] {
  const limit = params?.limit || 20;

  let whereClause = '';
  const queryParams: any[] = [];

  if (params?.category_id) {
    whereClause = 'WHERE r.category_id = ?';
    queryParams.push(params.category_id);
  }

  const resourceStmt = db.prepare(`
    SELECT r.id, r.name, r.scientific_name, r.family, c.name as category
    FROM resources r
    LEFT JOIN categories c ON r.category_id = c.id
    ${whereClause}
    ORDER BY r.name ASC
    LIMIT ?
  `);

  const resources = resourceStmt.all(...queryParams, limit) as Array<{
    id: string;
    name: string;
    scientific_name: string;
    family: string;
    category: string;
  }>;

  const growthStmt = db.prepare(`
    SELECT
      strftime('%Y', record_date) as year,
      resource_id,
      FIRST_VALUE(height_cm) OVER (PARTITION BY resource_id, strftime('%Y', record_date) ORDER BY record_date ASC) as first_height,
      LAST_VALUE(height_cm) OVER (PARTITION BY resource_id, strftime('%Y', record_date) ORDER BY record_date ASC) as last_height,
      FIRST_VALUE(db_hcm) OVER (PARTITION BY resource_id, strftime('%Y', record_date) ORDER BY record_date ASC) as first_dbh,
      LAST_VALUE(db_hcm) OVER (PARTITION BY resource_id, strftime('%Y', record_date) ORDER BY record_date ASC) as last_dbh
    FROM growth_records
    WHERE resource_id = ?
    ORDER BY record_date ASC
  `);

  const trends: ResourceGrowthTrend[] = [];

  for (const resource of resources) {
    const rawData = growthStmt.all(resource.id) as Array<{
      year: string;
      first_height: number | null;
      last_height: number | null;
      first_dbh: number | null;
      last_dbh: number | null;
    }>;

    const yearlyMap = new Map<string, {
      first_height: number | null;
      last_height: number | null;
      first_dbh: number | null;
      last_dbh: number | null;
    }>();

    for (const row of rawData) {
      if (!yearlyMap.has(row.year)) {
        yearlyMap.set(row.year, {
          first_height: row.first_height,
          last_height: row.last_height,
          first_dbh: row.first_dbh,
          last_dbh: row.last_dbh
        });
      }
    }

    const yearlyData = Array.from(yearlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, data]) => ({
        year,
        first_height: data.first_height,
        last_height: data.last_height,
        first_dbh: data.first_dbh,
        last_dbh: data.last_dbh,
        height_growth: data.first_height && data.last_height
          ? Math.round((data.last_height - data.first_height) * 10) / 10
          : null,
        dbh_growth: data.first_dbh && data.last_dbh
          ? Math.round((data.last_dbh - data.first_dbh) * 10) / 10
          : null
      }));

    if (yearlyData.length > 0) {
      trends.push({
        resource_id: resource.id,
        resource_name: resource.name,
        scientific_name: resource.scientific_name,
        family: resource.family,
        category: resource.category || '-',
        yearly_data: yearlyData
      });
    }
  }

  return trends.sort((a, b) => b.yearly_data.length - a.yearly_data.length);
}
