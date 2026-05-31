import express, { type Request, type Response } from 'express';

const router = express.Router();

const mockGeologyLayers = [
  {
    id: 'layer-1',
    name: '表层土壤层',
    rockType: '土壤',
    description: '地表松散堆积物，主要由砂、黏土和有机质组成',
    thickness: 5,
    color: '#8B4513',
    depth: 0,
    properties: {
      porosity: 0.45,
      permeability: 1e-5,
      density: 1.8,
    },
  },
  {
    id: 'layer-2',
    name: '砂岩层',
    rockType: '砂岩',
    description: '固结的砂粒沉积物，颗粒间由胶结物联结',
    thickness: 15,
    color: '#DAA520',
    depth: 5,
    properties: {
      porosity: 0.25,
      permeability: 1e-6,
      density: 2.3,
      compressiveStrength: 60,
    },
  },
  {
    id: 'layer-3',
    name: '石灰岩层',
    rockType: '石灰岩',
    description: '碳酸盐岩，主要由方解石组成，易被水溶蚀',
    thickness: 25,
    color: '#708090',
    depth: 20,
    properties: {
      porosity: 0.15,
      permeability: 1e-7,
      density: 2.7,
      compressiveStrength: 80,
      karstification: true,
    },
  },
  {
    id: 'layer-4',
    name: '页岩层',
    rockType: '页岩',
    description: '细粒碎屑沉积岩，具有页理构造',
    thickness: 20,
    color: '#556B2F',
    depth: 45,
    properties: {
      porosity: 0.10,
      permeability: 1e-9,
      density: 2.6,
      compressiveStrength: 40,
      organicContent: 2.5,
    },
  },
  {
    id: 'layer-5',
    name: '花岗岩基岩层',
    rockType: '花岗岩',
    description: '深成酸性火成岩，主要由石英、长石和云母组成',
    thickness: 50,
    color: '#2F4F4F',
    depth: 65,
    properties: {
      porosity: 0.02,
      permeability: 1e-12,
      density: 2.75,
      compressiveStrength: 150,
      radioactive: false,
    },
  },
];

router.get('/layers', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: mockGeologyLayers,
  });
});

router.get('/layers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const layer = mockGeologyLayers.find((l) => l.id === id);

  if (!layer) {
    return res.status(404).json({
      success: false,
      error: 'Layer not found',
    });
  }

  res.json({
    success: true,
    data: layer,
  });
});

router.get('/query/rock-info', (req: Request, res: Response) => {
  const { x, y, z } = req.query;

  if (!x || !y || !z) {
    return res.status(400).json({
      success: false,
      error: 'Missing coordinates',
    });
  }

  const depth = parseFloat(z as string);
  const layer = mockGeologyLayers.find(
    (l) => depth >= l.depth && depth < l.depth + l.thickness
  );

  if (!layer) {
    return res.json({
      success: true,
      data: null,
      message: 'No rock layer found at this depth',
    });
  }

  res.json({
    success: true,
    data: {
      position: { x: parseFloat(x as string), y: parseFloat(y as string), z: depth },
      layerName: layer.name,
      rockType: layer.rockType,
      depth: depth - layer.depth,
      properties: layer.properties,
    },
  });
});

router.post('/query/region', (req: Request, res: Response) => {
  const { bounds } = req.body;

  if (!bounds) {
    return res.status(400).json({
      success: false,
      error: 'Missing bounds parameter',
    });
  }

  res.json({
    success: true,
    data: {
      layers: mockGeologyLayers,
      bounds,
    },
  });
});

export default router;
