import { getDatabase } from '../models/database';
import { v4 as uuidv4 } from 'uuid';
import { FieldImage } from '../types';
import path from 'path';
import fs from 'fs';

const db = getDatabase();

export interface ImageUploadData {
  resource_id: string;
  original_name: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  description?: string | null;
  taken_date?: string | null;
  location?: string | null;
  photographer?: string | null;
}

export function createImage(data: ImageUploadData): FieldImage {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO field_images (
      id, resource_id, file_name, original_name, file_path,
      file_size, mime_type, description, taken_date,
      location, photographer, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, data.resource_id, data.file_name, data.original_name,
    data.file_path, data.file_size, data.mime_type,
    data.description || null, data.taken_date || null,
    data.location || null, data.photographer || null, now
  );

  return getImageById(id) as FieldImage;
}

export function getImageById(id: string): FieldImage | null {
  return db.prepare(`
    SELECT fi.*, r.name as resource_name, r.scientific_name
    FROM field_images fi
    LEFT JOIN resources r ON fi.resource_id = r.id
    WHERE fi.id = ?
  `).get(id) as FieldImage | null;
}

export function getImagesByResourceId(resourceId: string): FieldImage[] {
  return db.prepare(`
    SELECT * FROM field_images
    WHERE resource_id = ?
    ORDER BY created_at DESC
  `).all(resourceId) as FieldImage[];
}

export function getAllImages(params: {
  resource_id?: string;
  page?: number;
  page_size?: number;
}) {
  const page = params.page || 1;
  const page_size = params.page_size || 20;
  const offset = (page - 1) * page_size;

  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params.resource_id) {
    conditions.push('fi.resource_id = ?');
    queryParams.push(params.resource_id);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM field_images fi ${whereClause}`);
  const total = (countStmt.get(...queryParams) as { count: number }).count;

  const stmt = db.prepare(`
    SELECT fi.*, r.name as resource_name, r.scientific_name
    FROM field_images fi
    LEFT JOIN resources r ON fi.resource_id = r.id
    ${whereClause}
    ORDER BY fi.created_at DESC
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

export function updateImage(
  id: string,
  data: Partial<Omit<FieldImage, 'id' | 'created_at' | 'file_name' | 'file_path' | 'file_size' | 'mime_type'>>
): FieldImage | null {
  const existing = db.prepare('SELECT * FROM field_images WHERE id = ?').get(id);
  if (!existing) return null;

  const updateFields: string[] = [];
  const updateValues: any[] = [];

  const allowedFields = ['description', 'taken_date', 'location', 'photographer'];

  for (const field of allowedFields) {
    if ((data as any)[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      updateValues.push((data as any)[field]);
    }
  }

  updateValues.push(id);

  const stmt = db.prepare(`
    UPDATE field_images SET ${updateFields.join(', ')}
    WHERE id = ?
  `);

  stmt.run(...updateValues);

  return getImageById(id);
}

export function deleteImage(id: string): boolean {
  const image = db.prepare('SELECT * FROM field_images WHERE id = ?').get(id) as FieldImage | null;

  if (!image) return false;

  try {
    if (fs.existsSync(image.file_path)) {
      fs.unlinkSync(image.file_path);
    }
  } catch (err) {
    console.error('Error deleting image file:', err);
  }

  const stmt = db.prepare('DELETE FROM field_images WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}
