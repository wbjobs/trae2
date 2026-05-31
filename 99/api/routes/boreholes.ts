import { Router, type Request, type Response } from 'express';
import { boreholeStore } from '../data/mockData.js';
import type { Borehole, BoreholeLayer } from '../../src/types/index.js';
import { randomUUID } from 'crypto';

const router = Router();

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

router.get('/', (req: Request, res: Response): void => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 50;
  const keyword = (req.query.keyword as string) || '';
  const coordinateSystem = (req.query.coordinateSystem as string) || '';

  let boreholes = Array.from(boreholeStore.values());

  if (keyword) {
    boreholes = boreholes.filter((b) =>
      b.name.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  if (coordinateSystem) {
    boreholes = boreholes.filter((b) => b.coordinateSystem === coordinateSystem);
  }

  const total = boreholes.length;
  const totalPages = Math.ceil(total / pageSize);
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const paginatedData = boreholes.slice(skip, skip + take);

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
  const borehole = boreholeStore.get(id);

  if (!borehole) {
    res.status(404).json({
      success: false,
      error: 'Borehole not found'
    });
    return;
  }

  res.json({
    success: true,
    data: borehole
  });
});

router.post('/', (req: Request, res: Response): void => {
  const { name, longitude, latitude, elevation, depth, coordinateSystem, layers } = req.body;

  if (!name || longitude === undefined || latitude === undefined) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: name, longitude, latitude'
    });
    return;
  }

  const id = `bh-${randomUUID().slice(0, 8)}`;
  
  const boreholeLayers: BoreholeLayer[] = (layers || []).map((layer: Partial<BoreholeLayer>) => ({
    id: `layer-${randomUUID().slice(0, 8)}`,
    boreholeId: id,
    layerName: layer.layerName || '未命名地层',
    topDepth: layer.topDepth || 0,
    bottomDepth: layer.bottomDepth || 0,
    layerType: layer.layerType || 'unknown',
    color: layer.color || '#888888',
    description: layer.description || ''
  }));

  const newBorehole: Borehole = {
    id,
    name,
    longitude,
    latitude,
    elevation: elevation || 0,
    depth: depth || 0,
    coordinateSystem: coordinateSystem || 'WGS84',
    layers: boreholeLayers
  };

  boreholeStore.set(id, newBorehole);

  res.status(201).json({
    success: true,
    data: newBorehole,
    message: 'Borehole created successfully'
  });
});

router.put('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const existingBorehole = boreholeStore.get(id);

  if (!existingBorehole) {
    res.status(404).json({
      success: false,
      error: 'Borehole not found'
    });
    return;
  }

  const { name, longitude, latitude, elevation, depth, coordinateSystem, layers } = req.body;

  const updatedLayers: BoreholeLayer[] = layers
    ? layers.map((layer: BoreholeLayer) => ({
        ...layer,
        id: layer.id || `layer-${randomUUID().slice(0, 8)}`,
        boreholeId: id
      }))
    : existingBorehole.layers;

  const updatedBorehole: Borehole = {
    ...existingBorehole,
    name: name ?? existingBorehole.name,
    longitude: longitude ?? existingBorehole.longitude,
    latitude: latitude ?? existingBorehole.latitude,
    elevation: elevation ?? existingBorehole.elevation,
    depth: depth ?? existingBorehole.depth,
    coordinateSystem: coordinateSystem ?? existingBorehole.coordinateSystem,
    layers: updatedLayers
  };

  boreholeStore.set(id, updatedBorehole);

  res.json({
    success: true,
    data: updatedBorehole,
    message: 'Borehole updated successfully'
  });
});

router.delete('/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const deleted = boreholeStore.delete(id);

  if (!deleted) {
    res.status(404).json({
      success: false,
      error: 'Borehole not found'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Borehole deleted successfully'
  });
});

export default router;
