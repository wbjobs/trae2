import { Router, type Request, type Response } from 'express';
import { layerStore } from '../data/mockData.js';
import type { GeoLayer } from '../../src/types/index.js';
import { randomUUID } from 'crypto';

const router = Router();

router.get('/', (req: Request, res: Response): void => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 50;
  const type = (req.query.type as string) || '';

  let layers = Array.from(layerStore.values());

  if (type) {
    layers = layers.filter((l) => l.type === type);
  }

  const total = layers.length;
  const totalPages = Math.ceil(total / pageSize);
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const paginatedData = layers.slice(skip, skip + take);

  res.json({
    success: true,
    data: paginatedData,
    total,
    page,
    pageSize,
    totalPages,
  });
});

router.get('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const layer = layerStore.get(id);

  if (!layer) {
    res.status(404).json({
      success: false,
      error: 'Layer not found'
    });
    return;
  }

  res.json({
    success: true,
    data: layer
  });
});

router.post('/', (req: Request, res: Response): void => {
  const { name, type, color, opacity, geometry, properties } = req.body;

  if (!name) {
    res.status(400).json({
      success: false,
      error: 'Missing required field: name'
    });
    return;
  }

  const id = `geo-layer-${randomUUID().slice(0, 8)}`;

  const newLayer: GeoLayer = {
    id,
    name,
    type: type || 'polygon',
    color: color || '#888888',
    opacity: opacity ?? 0.7,
    geometry: geometry || null,
    properties: properties || {}
  };

  layerStore.set(id, newLayer);

  res.status(201).json({
    success: true,
    data: newLayer,
    message: 'Layer created successfully'
  });
});

router.put('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const existingLayer = layerStore.get(id);

  if (!existingLayer) {
    res.status(404).json({
      success: false,
      error: 'Layer not found'
    });
    return;
  }

  const { name, type, color, opacity, geometry, properties } = req.body;

  const updatedLayer: GeoLayer = {
    ...existingLayer,
    name: name ?? existingLayer.name,
    type: type ?? existingLayer.type,
    color: color ?? existingLayer.color,
    opacity: opacity ?? existingLayer.opacity,
    geometry: geometry ?? existingLayer.geometry,
    properties: properties ?? existingLayer.properties
  };

  layerStore.set(id, updatedLayer);

  res.json({
    success: true,
    data: updatedLayer,
    message: 'Layer updated successfully'
  });
});

router.delete('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const deleted = layerStore.delete(id);

  if (!deleted) {
    res.status(404).json({
      success: false,
      error: 'Layer not found'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Layer deleted successfully'
  });
});

export default router;
