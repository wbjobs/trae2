import { transformCoordinate, type CRS } from '../utils/coordinateTransform.js';
import type { CoordinateSystem } from '../../src/types/index.js';

const coordinateSystems: CoordinateSystem[] = [
  {
    id: 'WGS84',
    name: 'WGS84 坐标系',
    description: 'World Geodetic System 1984，国际通用坐标系，GPS 默认使用'
  },
  {
    id: 'GCJ02',
    name: 'GCJ02 坐标系',
    description: '国家测绘局2000坐标系，中国大陆通用加密坐标系'
  },
  {
    id: 'BD09',
    name: 'BD09 坐标系',
    description: '百度坐标系，百度地图使用的加密坐标系'
  },
  {
    id: 'XIAN80',
    name: '西安80 坐标系',
    description: '1980年西安坐标系，中国国家大地坐标系之一'
  },
  {
    id: 'BJ54',
    name: '北京54 坐标系',
    description: '1954年北京坐标系，中国早期国家大地坐标系'
  }
];

export function getCoordinateSystems(): CoordinateSystem[] {
  return coordinateSystems;
}

export interface TransformRequest {
  coordinates: [number, number][];
  from: CRS;
  to: CRS;
}

export interface TransformResult {
  original: [number, number];
  transformed: [number, number];
  from: CRS;
  to: CRS;
}

export function batchTransform(request: TransformRequest): TransformResult[] {
  const { coordinates, from, to } = request;
  
  return coordinates.map(coord => ({
    original: coord,
    transformed: transformCoordinate(coord, from, to),
    from,
    to
  }));
}

export function singleTransform(
  coord: [number, number],
  from: CRS,
  to: CRS
): TransformResult {
  return {
    original: coord,
    transformed: transformCoordinate(coord, from, to),
    from,
    to
  };
}

export function isValidCRS(crs: string): crs is CRS {
  return ['WGS84', 'GCJ02', 'BD09', 'XIAN80', 'BJ54'].includes(crs);
}
