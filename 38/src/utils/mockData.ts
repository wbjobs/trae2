import { GeologyLayer, TerrainData } from '../types';

export function generateTerrainData(): TerrainData {
  const resolution = 128;
  const bounds = {
    minX: 0,
    maxX: 256,
    minY: 0,
    maxY: 256,
    minZ: 0,
    maxZ: 100,
  };

  const demData: number[][] = [];

  for (let y = 0; y < resolution; y++) {
    demData[y] = [];
    for (let x = 0; x < resolution; x++) {
      const nx = x / resolution * 4 - 2;
      const ny = y / resolution * 4 - 2;
      
      const height = 
        Math.sin(nx * 1.5) * 20 +
        Math.cos(ny * 1.5) * 20 +
        Math.sin((nx + ny) * 2.0) * 10 +
        Math.cos((nx - ny) * 1.5) * 15 +
        Math.sin(nx * 3.0 + ny * 2.0) * 8 +
        50;
      
      demData[y][x] = Math.max(5, Math.min(95, height));
    }
  }

  return {
    id: 'terrain-' + Date.now(),
    resolution,
    bounds,
    demData,
  };
}

export function generateGeologyLayers(): GeologyLayer[] {
  return mockGeologyLayers.map(layer => ({ ...layer }));
}

export const mockGeologyLayers: GeologyLayer[] = [
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

export function generateGeologyLayerDepths(
  resolution: number,
  baseDepth: number,
  variation: number = 5
): number[][] {
  const depths: number[][] = [];
  for (let y = 0; y < resolution; y++) {
    depths[y] = [];
    for (let x = 0; x < resolution; x++) {
      const noise = (Math.sin(x * 0.1) * Math.cos(y * 0.1) + 1) * 0.5;
      depths[y][x] = baseDepth + noise * variation;
    }
  }
  return depths;
}

export function getRockTypeColor(rockType: string): string {
  const colorMap: Record<string, string> = {
    '土壤': '#8B4513',
    '砂岩': '#DAA520',
    '石灰岩': '#708090',
    '页岩': '#556B2F',
    '花岗岩': '#2F4F4F',
    '玄武岩': '#1C1C1C',
    '大理岩': '#F5F5DC',
    '片麻岩': '#696969',
  };
  return colorMap[rockType] || '#808080';
}
