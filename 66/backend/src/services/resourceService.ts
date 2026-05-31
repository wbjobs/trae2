import { getDatabase } from '../models/database';
import { v4 as uuidv4 } from 'uuid';
import { Resource, ResourceWithRelations, PaginatedResponse } from '../types';

const db = getDatabase();

export interface ResourceQueryParams {
  page?: number;
  page_size?: number;
  category_id?: string;
  search?: string;
  province?: string;
  city?: string;
  protection_level?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export function createResource(data: Omit<Resource, 'id' | 'created_at' | 'updated_at'>): Resource {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO resources (
      id, name, scientific_name, category_id, family, genus, species,
      description, origin, habitat, protection_level,
      latitude, longitude, altitude, address, province, city, district,
      surveyor, survey_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, data.name, data.scientific_name, data.category_id,
    data.family, data.genus, data.species, data.description,
    data.origin, data.habitat, data.protection_level,
    data.latitude, data.longitude, data.altitude, data.address,
    data.province, data.city, data.district, data.surveyor,
    data.survey_date, now, now
  );

  return getResourceById(id) as Resource;
}

export function getResourceById(id: string): ResourceWithRelations | null {
  const resource = db.prepare(`
    SELECT r.*, c.name as category_name, c.code as category_code
    FROM resources r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.id = ?
  `).get(id) as (Resource & { category_name: string | null; category_code: string | null }) | null;

  if (!resource) return null;

  const growthRecords = db.prepare(`
    SELECT * FROM growth_records
    WHERE resource_id = ?
    ORDER BY record_date DESC
  `).all(id);

  const images = db.prepare(`
    SELECT * FROM field_images
    WHERE resource_id = ?
    ORDER BY created_at DESC
  `).all(id);

  return {
    ...resource,
    category: resource.category_name ? {
      id: resource.category_id!,
      name: resource.category_name,
      code: resource.category_code,
      parent_id: null,
      description: null,
      sort_order: 0,
      created_at: '',
      updated_at: ''
    } : null,
    growth_records: growthRecords as any[],
    images: images as any[]
  };
}

export function getResources(params: ResourceQueryParams): PaginatedResponse<Resource> {
  const page = params.page || 1;
  const page_size = params.page_size || 20;
  const offset = (page - 1) * page_size;

  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params.category_id) {
    const getDescendantIds = (parentId: string, allCategories: any[]): string[] => {
      const ids: string[] = [parentId];
      const children = allCategories.filter(c => c.parent_id === parentId);
      for (const child of children) {
        ids.push(...getDescendantIds(child.id, allCategories));
      }
      return ids;
    };

    const allCategories = db.prepare('SELECT id, parent_id FROM categories').all();
    const categoryIds = getDescendantIds(params.category_id, allCategories);
    
    const placeholders = categoryIds.map(() => '?').join(', ');
    conditions.push(`r.category_id IN (${placeholders})`);
    queryParams.push(...categoryIds);
  }

  if (params.search) {
    conditions.push('(r.name LIKE ? OR r.scientific_name LIKE ? OR r.family LIKE ?)');
    const searchTerm = `%${params.search}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm);
  }

  if (params.province) {
    conditions.push('r.province = ?');
    queryParams.push(params.province);
  }

  if (params.city) {
    conditions.push('r.city = ?');
    queryParams.push(params.city);
  }

  if (params.protection_level) {
    conditions.push('r.protection_level = ?');
    queryParams.push(params.protection_level);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM resources r ${whereClause}`);
  const total = (countStmt.get(...queryParams) as { count: number }).count;

  const sortBy = params.sort_by || 'created_at';
  const sortOrder = params.sort_order || 'desc';

  const stmt = db.prepare(`
    SELECT r.* FROM resources r
    ${whereClause}
    ORDER BY r.${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `);

  const data = stmt.all(...queryParams, page_size, offset) as Resource[];

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

export function updateResource(id: string, data: Partial<Omit<Resource, 'id' | 'created_at'>>): Resource | null {
  const existing = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
  if (!existing) return null;

  const updateFields: string[] = [];
  const updateValues: any[] = [];

  const allowedFields = [
    'name', 'scientific_name', 'category_id', 'family', 'genus', 'species',
    'description', 'origin', 'habitat', 'protection_level',
    'latitude', 'longitude', 'altitude', 'address', 'province', 'city', 'district',
    'surveyor', 'survey_date'
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
    UPDATE resources SET ${updateFields.join(', ')}
    WHERE id = ?
  `);

  stmt.run(...updateValues);

  return getResourceById(id) as Resource;
}

export function deleteResource(id: string): boolean {
  const stmt = db.prepare('DELETE FROM resources WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getResourceStats() {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_resources,
      COUNT(DISTINCT family) as total_families,
      COUNT(DISTINCT genus) as total_genera,
      COUNT(DISTINCT species) as total_species,
      COUNT(DISTINCT province) as total_provinces,
      COUNT(CASE WHEN protection_level = '国家一级保护' THEN 1 END) as level1_protected,
      COUNT(CASE WHEN protection_level = '国家二级保护' THEN 1 END) as level2_protected
    FROM resources
  `).get() as {
    total_resources: number;
    total_families: number;
    total_genera: number;
    total_species: number;
    total_provinces: number;
    level1_protected: number;
    level2_protected: number;
  };

  const categoryStats = db.prepare(`
    SELECT c.id, c.name, c.code, COUNT(r.id) as resource_count
    FROM categories c
    LEFT JOIN resources r ON c.id = r.category_id
    WHERE c.parent_id IS NULL
    GROUP BY c.id, c.name, c.code
    ORDER BY resource_count DESC
  `).all();

  return {
    ...stats,
    category_stats: categoryStats
  };
}

export interface HeatmapDataPoint {
  name: string;
  value: [number, number, number];
  resource_count: number;
  province: string | null;
  city: string | null;
}

export function getDistributionHeatmap(params?: {
  category_id?: string;
  protection_level?: string;
}): HeatmapDataPoint[] {
  const conditions: string[] = [];
  const queryParams: any[] = [];

  conditions.push('latitude IS NOT NULL AND longitude IS NOT NULL');

  if (params?.category_id) {
    const getDescendantIds = (parentId: string, allCategories: any[]): string[] => {
      const ids: string[] = [parentId];
      const children = allCategories.filter(c => c.parent_id === parentId);
      for (const child of children) {
        ids.push(...getDescendantIds(child.id, allCategories));
      }
      return ids;
    };

    const allCategories = db.prepare('SELECT id, parent_id FROM categories').all();
    const categoryIds = getDescendantIds(params.category_id, allCategories);
    
    const placeholders = categoryIds.map(() => '?').join(', ');
    conditions.push(`category_id IN (${placeholders})`);
    queryParams.push(...categoryIds);
  }

  if (params?.protection_level) {
    conditions.push('protection_level = ?');
    queryParams.push(params.protection_level);
  }

  const whereClause = 'WHERE ' + conditions.join(' AND ');

  const stmt = db.prepare(`
    SELECT
      latitude,
      longitude,
      province,
      city,
      district,
      COUNT(*) as resource_count
    FROM resources
    ${whereClause}
    GROUP BY latitude, longitude, province, city, district
    ORDER BY resource_count DESC
  `);

  const results = stmt.all(...queryParams) as Array<{
    latitude: number;
    longitude: number;
    province: string | null;
    city: string | null;
    district: string | null;
    resource_count: number;
  }>;

  return results.map(row => ({
    name: row.district || row.city || row.province || '未知',
    value: [row.longitude, row.latitude, row.resource_count],
    resource_count: row.resource_count,
    province: row.province,
    city: row.city
  }));
}

export interface ProvinceStats {
  province: string;
  city: string | null;
  resource_count: number;
  total_families: number;
  total_species: number;
  protected_count: number;
}

export function getProvinceDistribution(): ProvinceStats[] {
  const stmt = db.prepare(`
    SELECT
      COALESCE(province, '未知') as province,
      city,
      COUNT(*) as resource_count,
      COUNT(DISTINCT family) as total_families,
      COUNT(DISTINCT species) as total_species,
      SUM(CASE WHEN protection_level IS NOT NULL THEN 1 ELSE 0 END) as protected_count
    FROM resources
    GROUP BY COALESCE(province, '未知'), city
    ORDER BY resource_count DESC
  `);

  return stmt.all() as ProvinceStats[];
}

export function getGrowthPerformanceRanking(limit: number = 10) {
  const stmt = db.prepare(`
    SELECT
      r.id,
      r.name,
      r.scientific_name,
      r.family,
      c.name as category,
      COUNT(gr.id) as record_count,
      MIN(gr.height_cm) as min_height,
      MAX(gr.height_cm) as max_height,
      MAX(gr.height_cm) - MIN(gr.height_cm) as total_growth,
      MIN(gr.record_date) as first_record,
      MAX(gr.record_date) as last_record
    FROM resources r
    LEFT JOIN growth_records gr ON r.id = gr.resource_id
    LEFT JOIN categories c ON r.category_id = c.id
    GROUP BY r.id
    HAVING record_count >= 2
    ORDER BY total_growth DESC
    LIMIT ?
  `);

  const results = stmt.all(limit) as Array<{
    id: string;
    name: string;
    scientific_name: string;
    family: string;
    category: string;
    record_count: number;
    min_height: number | null;
    max_height: number | null;
    total_growth: number | null;
    first_record: string;
    last_record: string;
  }>;

  return results.map(row => {
    const firstDate = new Date(row.first_record);
    const lastDate = new Date(row.last_record);
    const yearsDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

    return {
      id: row.id,
      name: row.name,
      scientific_name: row.scientific_name,
      family: row.family,
      category: row.category,
      record_count: row.record_count,
      min_height: row.min_height,
      max_height: row.max_height,
      total_growth: row.total_growth ? Math.round(row.total_growth * 10) / 10 : null,
      annual_growth_rate: yearsDiff > 0 && row.total_growth
        ? Math.round((row.total_growth / yearsDiff) * 10) / 10
        : null,
      monitoring_period: `${firstDate.getFullYear()}-${lastDate.getFullYear()}`
    };
  });
}
