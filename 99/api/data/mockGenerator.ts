import { randomUUID } from 'crypto';
import type { Borehole, BoreholeLayer, GeoLayer, Annotation } from '../../src/types/index.js';

class SeededRandom {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max));
  }

  pick<T>(array: T[]): T {
    return array[this.int(0, array.length)];
  }
}

const layerNames = [
  '表土层', '粘土层', '砂土层', '砾石层', '风化层',
  '基岩层', '煤层', '含水层', '隔水层', '破碎带'
];

const layerColors = [
  '#8B4513', '#D2691E', '#DEB887', '#A0522D', '#8B7355',
  '#CD853F', '#2F4F4F', '#4682B4', '#708090', '#696969'
];

const layerTypes = [
  'soil', 'clay', 'sand', 'gravel', 'weathered',
  'bedrock', 'coal', 'aquifer', 'aquiclude', 'fracture'
];

const boreholeNamePrefixes = ['ZK', 'BH', 'TK', 'JZ', 'YZ'];

const annotationTypes: Annotation['type'][] = ['pin', 'label', 'area'];
const annotationColors = ['#e87c3e', '#38a169', '#4299e1', '#e53e3e', '#805ad5'];

export function generateBoreholeLayers(
  count: number,
  boreholeId: string,
  rng: SeededRandom
): BoreholeLayer[] {
  const layers: BoreholeLayer[] = [];
  let currentDepth = 0;

  for (let i = 0; i < count; i++) {
    const layerIndex = i % layerNames.length;
    const thickness = rng.range(2, 15);
    const topDepth = currentDepth;
    const bottomDepth = currentDepth + thickness;

    layers.push({
      id: `layer-${randomUUID().slice(0, 8)}`,
      boreholeId,
      layerName: layerNames[layerIndex],
      topDepth,
      bottomDepth,
      layerType: layerTypes[layerIndex],
      color: layerColors[layerIndex],
      description: `${layerNames[layerIndex]}层，厚度约${thickness.toFixed(1)}米`
    });

    currentDepth = bottomDepth;
  }

  return layers;
}

export function generateBoreholes(
  count: number,
  options: {
    centerLon?: number;
    centerLat?: number;
    radius?: number;
    seed?: number;
    minElevation?: number;
    maxElevation?: number;
    minDepth?: number;
    maxDepth?: number;
    minLayers?: number;
    maxLayers?: number;
  } = {}
): Borehole[] {
  const {
    centerLon = 116.397,
    centerLat = 39.908,
    radius = 0.1,
    seed = Date.now(),
    minElevation = 20,
    maxElevation = 80,
    minDepth = 20,
    maxDepth = 200,
    minLayers = 3,
    maxLayers = 8,
  } = options;

  const rng = new SeededRandom(seed);
  const boreholes: Borehole[] = [];

  for (let i = 0; i < count; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(0, radius);
    const lon = centerLon + Math.cos(angle) * distance;
    const lat = centerLat + Math.sin(angle) * distance;
    const elevation = rng.range(minElevation, maxElevation);
    const depth = rng.range(minDepth, maxDepth);
    const layerCount = rng.int(minLayers, maxLayers + 1);

    const id = `bh-${randomUUID().slice(0, 8)}`;
    const prefix = rng.pick(boreholeNamePrefixes);

    boreholes.push({
      id,
      name: `${prefix}-${String(i + 1).padStart(3, '0')}`,
      longitude: lon,
      latitude: lat,
      elevation,
      depth,
      coordinateSystem: 'WGS84',
      layers: generateBoreholeLayers(layerCount, id, rng),
    });
  }

  return boreholes;
}

export function generateGeoLayers(
  count: number,
  options: {
    seed?: number;
  } = {}
): GeoLayer[] {
  const { seed = Date.now() } = options;
  const rng = new SeededRandom(seed);
  const layers: GeoLayer[] = [];

  const layerTypesList = ['polygon', 'line', 'point'];

  for (let i = 0; i < count; i++) {
    const layerIndex = i % layerNames.length;

    layers.push({
      id: `geo-layer-${randomUUID().slice(0, 8)}`,
      name: layerNames[layerIndex],
      type: rng.pick(layerTypesList),
      color: layerColors[layerIndex],
      opacity: rng.range(0.4, 0.9),
      geometry: null,
      properties: {
        description: `${layerNames[layerIndex]}分布层`,
        thickness: rng.range(5, 50).toFixed(1),
      },
    });
  }

  return layers;
}

export function generateAnnotations(
  count: number,
  options: {
    centerLon?: number;
    centerLat?: number;
    radius?: number;
    seed?: number;
  } = {}
): Annotation[] {
  const {
    centerLon = 116.397,
    centerLat = 39.908,
    radius = 0.1,
    seed = Date.now(),
  } = options;

  const rng = new SeededRandom(seed);
  const annotations: Annotation[] = [];

  const annotationNames = [
    '观测点', '取样点', '异常区', '标志点', '控制点',
    '监测点', '拐点', '交点', '端点', '中点'
  ];

  const annotationDescriptions = [
    '地质观测点位标记',
    '土壤取样位置',
    '地球物理异常区域',
    '地层分界标志',
    '测量控制点',
    '变形监测点',
    '钻孔轨迹拐点',
    '构造线交点',
    '勘探线端点',
    '剖面线中点'
  ];

  for (let i = 0; i < count; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(0, radius);
    const x = Math.cos(angle) * distance * 111000 / 1000;
    const z = Math.sin(angle) * distance * 111000 / 1000;
    const y = rng.range(-50, 50);

    annotations.push({
      id: `anno-${randomUUID().slice(0, 8)}`,
      type: rng.pick(annotationTypes),
      name: `${annotationNames[i % annotationNames.length]}${i + 1}`,
      description: rng.pick(annotationDescriptions),
      position: [x, y, z],
      color: rng.pick(annotationColors),
      createdAt: new Date(Date.now() - rng.int(0, 30 * 24 * 60 * 60 * 1000)).toISOString(),
    });
  }

  return annotations;
}

export function initLargeMockData() {
  const seed = 42;
  const boreholes = generateBoreholes(1000, { seed, radius: 0.05 });
  const geoLayers = generateGeoLayers(20, { seed });
  const annotations = generateAnnotations(500, { seed, radius: 0.05 });

  return { boreholes, geoLayers, annotations };
}
