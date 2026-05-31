import { getDatabase } from '../models/database';
import { v4 as uuidv4 } from 'uuid';
import { Category, CategoryWithChildren } from '../types';

const db = getDatabase();

export function createCategory(
  data: Omit<Category, 'id' | 'created_at' | 'updated_at'>
): Category {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO categories (
      id, name, parent_id, code, description, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, data.name, data.parent_id, data.code,
    data.description, data.sort_order, now, now
  );

  return getCategoryById(id) as Category;
}

export function getCategoryById(id: string): Category | null {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category | null;
}

export function getAllCategories(): Category[] {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all() as Category[];
}

export function getCategoryTree(): CategoryWithChildren[] {
  const allCategories = getAllCategories();

  const categoryMap = new Map<string, CategoryWithChildren>();
  const roots: CategoryWithChildren[] = [];

  for (const cat of allCategories) {
    categoryMap.set(cat.id, { ...cat, children: [] });
  }

  for (const cat of allCategories) {
    const node = categoryMap.get(cat.id)!;
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      categoryMap.get(cat.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function getCategoryWithDescendants(parentId: string): Category[] {
  const allCategories = getAllCategories();
  const descendantIds = new Set<string>();
  const queue = [parentId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    descendantIds.add(current);

    for (const cat of allCategories) {
      if (cat.parent_id === current && !descendantIds.has(cat.id)) {
        queue.push(cat.id);
      }
    }
  }

  return allCategories.filter(cat => descendantIds.has(cat.id));
}

export function updateCategory(
  id: string,
  data: Partial<Omit<Category, 'id' | 'created_at'>>
): Category | null {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) return null;

  const updateFields: string[] = [];
  const updateValues: any[] = [];

  const allowedFields = ['name', 'parent_id', 'code', 'description', 'sort_order'];

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
    UPDATE categories SET ${updateFields.join(', ')}
    WHERE id = ?
  `);

  stmt.run(...updateValues);

  return getCategoryById(id);
}

export function deleteCategory(id: string): boolean {
  const hasChildren = db.prepare(
    'SELECT COUNT(*) as count FROM categories WHERE parent_id = ?'
  ).get(id) as { count: number };

  if (hasChildren.count > 0) {
    throw new Error('该分类下存在子分类，无法删除');
  }

  const hasResources = db.prepare(
    'SELECT COUNT(*) as count FROM resources WHERE category_id = ?'
  ).get(id) as { count: number };

  if (hasResources.count > 0) {
    throw new Error('该分类下存在种质资源，无法删除');
  }

  const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}
