import { getDatabase, saveDatabase } from '../database/init.js';
import type { BridgeModel, DefectData, Layer, StressResult } from '../../shared/index.js';

export function getAllBridges(): BridgeModel[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT id, name, description, model_url as modelUrl, created_at as createdAt, updated_at as updatedAt FROM bridges`);
  const result = stmt.getAsObject() as unknown;
  const results: BridgeModel[] = [];
  
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as BridgeModel);
  }
  
  return results;
}

export function getBridgeById(id: string): BridgeModel | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT id, name, description, model_url as modelUrl, created_at as createdAt, updated_at as updatedAt FROM bridges WHERE id = ?`);
  stmt.bind([id]);
  
  if (stmt.step()) {
    return stmt.getAsObject() as unknown as BridgeModel;
  }
  return null;
}

export function getDefectsByBridgeId(bridgeId: string): DefectData[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT 
      id, bridge_id as bridgeId, position_x, position_y, position_z,
      type, severity, description, image_url as imageUrl,
      detected_at as detectedAt, layer_id as layerId, creator_id as creatorId
    FROM defects WHERE bridge_id = ?
  `);
  stmt.bind([bridgeId]);
  
  const results: DefectData[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    results.push({
      ...row,
      position: { x: row.position_x, y: row.position_y, z: row.position_z },
    });
  }
  
  return results;
}

export function createDefect(defect: Omit<DefectData, 'id' | 'detectedAt'>): DefectData {
  const db = getDatabase();
  const id = `defect-${Date.now()}`;
  const detectedAt = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO defects (id, bridge_id, layer_id, creator_id, position_x, position_y, position_z, type, severity, description, image_url, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run([
    id,
    defect.bridgeId,
    defect.layerId,
    defect.creatorId || null,
    defect.position.x,
    defect.position.y,
    defect.position.z,
    defect.type,
    defect.severity,
    defect.description,
    defect.imageUrl || null,
    detectedAt,
  ]);
  
  saveDatabase(db);
  
  return {
    ...defect,
    id,
    detectedAt,
  };
}

export function updateDefect(id: string, updates: Partial<DefectData>): DefectData | null {
  const db = getDatabase();
  
  const existing = db.prepare(`SELECT * FROM defects WHERE id = ?`);
  existing.bind([id]);
  if (!existing.step()) {
    return null;
  }
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.type) { fields.push('type = ?'); values.push(updates.type); }
  if (updates.severity) { fields.push('severity = ?'); values.push(updates.severity); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.imageUrl !== undefined) { fields.push('image_url = ?'); values.push(updates.imageUrl); }
  if (updates.layerId) { fields.push('layer_id = ?'); values.push(updates.layerId); }
  if (updates.position) {
    fields.push('position_x = ?', 'position_y = ?', 'position_z = ?');
    values.push(updates.position.x, updates.position.y, updates.position.z);
  }
  
  values.push(id);
  
  const stmt = db.prepare(`UPDATE defects SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(values);
  saveDatabase(db);
  
  return getDefectById(id);
}

export function deleteDefect(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM defects WHERE id = ?`);
  stmt.run([id]);
  saveDatabase(db);
  return true;
}

function getDefectById(id: string): DefectData | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT 
      id, bridge_id as bridgeId, position_x, position_y, position_z,
      type, severity, description, image_url as imageUrl,
      detected_at as detectedAt, layer_id as layerId, creator_id as creatorId
    FROM defects WHERE id = ?
  `);
  stmt.bind([id]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject() as any;
    return {
      ...row,
      position: { x: row.position_x, y: row.position_y, z: row.position_z },
    };
  }
  return null;
}

export function getLayersByBridgeId(bridgeId: string): Layer[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT id, name, color, visible, bridge_id as bridgeId FROM layers WHERE bridge_id = ?`);
  stmt.bind([bridgeId]);
  
  const results: Layer[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    results.push({
      ...row,
      visible: row.visible === 1 || row.visible === true,
    });
  }
  
  return results;
}

export function createLayer(layer: Omit<Layer, 'id'>): Layer {
  const db = getDatabase();
  const id = `layer-${Date.now()}`;
  
  const stmt = db.prepare(`INSERT INTO layers (id, bridge_id, name, color, visible) VALUES (?, ?, ?, ?, ?)`);
  stmt.run([id, layer.bridgeId, layer.name, layer.color, layer.visible ? 1 : 0]);
  saveDatabase(db);
  
  return { ...layer, id };
}

export function updateLayer(id: string, updates: Partial<Layer>): Layer | null {
  const db = getDatabase();
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.name) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.color) { fields.push('color = ?'); values.push(updates.color); }
  if (updates.visible !== undefined) { fields.push('visible = ?'); values.push(updates.visible ? 1 : 0); }
  
  values.push(id);
  
  const stmt = db.prepare(`UPDATE layers SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(values);
  saveDatabase(db);
  
  const result = db.prepare(`SELECT id, name, color, visible, bridge_id as bridgeId FROM layers WHERE id = ?`);
  result.bind([id]);
  if (result.step()) {
    const row = result.getAsObject() as any;
    return { ...row, visible: row.visible === 1 };
  }
  return null;
}

export function getStressByBridgeId(bridgeId: string): StressResult[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, bridge_id as bridgeId, element_id as elementId,
           max_stress as maxStress, min_stress as minStress,
           stress_distribution as stressDistribution, analysis_date as analysisDate
    FROM stress_results WHERE bridge_id = ?
  `);
  stmt.bind([bridgeId]);
  
  const results: StressResult[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    results.push({
      ...row,
      stressDistribution: JSON.parse(row.stressDistribution),
    });
  }
  
  return results;
}
