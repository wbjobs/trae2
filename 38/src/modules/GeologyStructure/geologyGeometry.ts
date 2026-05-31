import * as THREE from 'three';
import { GeologyLayer, TerrainData } from '../../types';
import { generateGeologyLayerDepths } from '../../utils/mockData';

export interface GeologyGeometryResult {
  geometry: THREE.BufferGeometry;
  bottomHeights: number[][];
  topHeights: number[][];
}

export function generateGeologyLayerGeometry(
  layer: GeologyLayer,
  terrainData: TerrainData,
  options: {
    step?: number;
    clipNormal?: [number, number, number];
    clipOrigin?: [number, number, number];
    clipEpsilon?: number;
  } = {}
): GeologyGeometryResult {
  const { demData, resolution, bounds } = terrainData;
  const {
    step = 1,
    clipNormal,
    clipOrigin,
    clipEpsilon = 0.1,
  } = options;

  const layerDepths = generateGeologyLayerDepths(resolution, layer.depth, 3);
  const geo = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const bottomHeights: number[][] = [];
  const topHeights: number[][] = [];

  const vertexMap = new Map<string, number>();
  const effectiveStep = Math.max(1, step);

  const getVertexIndex = (x: number, y: number, isTop: boolean): number | null => {
    const worldX = (x / (resolution - 1)) * width + bounds.minX;
    const worldY = (y / (resolution - 1)) * height + bounds.minY;

    const terrainHeight = demData[y]?.[x] ?? 0;
    const layerDepthVal = layerDepths[y]?.[x] ?? layer.depth;
    const z = isTop
      ? terrainHeight - layerDepthVal
      : terrainHeight - layerDepthVal - layer.thickness;

    if (y >= 0 && y < resolution && x >= 0 && x < resolution) {
      if (isTop) {
        if (!topHeights[y]) topHeights[y] = [];
        topHeights[y][x] = z;
      } else {
        if (!bottomHeights[y]) bottomHeights[y] = [];
        bottomHeights[y][x] = z;
      }
    }

    if (clipNormal && clipOrigin) {
      const pos = new THREE.Vector3(worldX, worldY, z);
      const origin = new THREE.Vector3(...clipOrigin);
      const normal = new THREE.Vector3(...clipNormal).normalize();
      const toPoint = pos.clone().sub(origin);
      const dist = toPoint.dot(normal);

      if (dist < -clipEpsilon) return null;
    }

    const key = `${x}_${y}_${isTop ? 1 : 0}`;
    if (!vertexMap.has(key)) {
      vertexMap.set(key, vertices.length / 3);
      vertices.push(worldX, worldY, z);
    }
    return vertexMap.get(key)!;
  };

  for (let y = 0; y < resolution - effectiveStep; y += effectiveStep) {
    for (let x = 0; x < resolution - effectiveStep; x += effectiveStep) {
      const x1 = x + effectiveStep;
      const y1 = y + effectiveStep;

      const b00 = getVertexIndex(x, y, false);
      const b10 = getVertexIndex(x1, y, false);
      const b01 = getVertexIndex(x, y1, false);
      const b11 = getVertexIndex(x1, y1, false);

      const t00 = getVertexIndex(x, y, true);
      const t10 = getVertexIndex(x1, y, true);
      const t01 = getVertexIndex(x, y1, true);
      const t11 = getVertexIndex(x1, y1, true);

      if (b00 !== null && b01 !== null && b10 !== null) {
        indices.push(b00, b01, b10);
      }
      if (b10 !== null && b01 !== null && b11 !== null) {
        indices.push(b10, b01, b11);
      }

      if (t00 !== null && t10 !== null && t01 !== null) {
        indices.push(t00, t10, t01);
      }
      if (t10 !== null && t11 !== null && t01 !== null) {
        indices.push(t10, t11, t01);
      }

      if (b00 !== null && b10 !== null && t00 !== null) {
        indices.push(b00, b10, t00);
      }
      if (b10 !== null && t10 !== null && t00 !== null) {
        indices.push(b10, t10, t00);
      }

      if (b10 !== null && b11 !== null && t10 !== null) {
        indices.push(b10, b11, t10);
      }
      if (b11 !== null && t11 !== null && t10 !== null) {
        indices.push(b11, t11, t10);
      }

      if (b11 !== null && b01 !== null && t11 !== null) {
        indices.push(b11, b01, t11);
      }
      if (b01 !== null && t01 !== null && t11 !== null) {
        indices.push(b01, t01, t11);
      }

      if (b01 !== null && b00 !== null && t01 !== null) {
        indices.push(b01, b00, t01);
      }
      if (b00 !== null && t00 !== null && t01 !== null) {
        indices.push(b00, t00, t01);
      }
    }
  }

  if (vertices.length === 0) {
    vertices.push(0, 0, 0);
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (indices.length > 0) {
    geo.setIndex(indices);
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();

  return { geometry: geo, bottomHeights, topHeights };
}

export function generateGeologyLayerBoundingBox(
  layer: GeologyLayer,
  terrainData: TerrainData
): THREE.Box3 {
  const { bounds, demData, resolution } = terrainData;
  const layerDepths = generateGeologyLayerDepths(resolution, layer.depth, 3);

  let minZ = Infinity;
  let maxZ = -Infinity;

  const sampleStep = Math.max(1, Math.floor(resolution / 64));
  
  for (let y = 0; y < resolution; y += sampleStep) {
    for (let x = 0; x < resolution; x += sampleStep) {
      const terrainHeight = demData[y]?.[x] ?? 0;
      const layerDepthVal = layerDepths[y]?.[x] ?? layer.depth;
      const bottomZ = terrainHeight - layerDepthVal - layer.thickness;
      const topZ = terrainHeight - layerDepthVal;
      minZ = Math.min(minZ, bottomZ);
      maxZ = Math.max(maxZ, topZ);
    }
  }

  return new THREE.Box3(
    new THREE.Vector3(bounds.minX, bounds.minY, minZ),
    new THREE.Vector3(bounds.maxX, bounds.maxY, maxZ)
  );
}

export function getLayerAtPoint(
  layers: GeologyLayer[],
  terrainData: TerrainData,
  worldX: number,
  worldY: number,
  worldZ: number
): GeologyLayer | null {
  const { bounds, demData, resolution } = terrainData;
  
  const gridX = Math.floor(((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * resolution);
  const gridY = Math.floor(((worldY - bounds.minY) / (bounds.maxY - bounds.minY)) * resolution);

  if (gridX < 0 || gridX >= resolution || gridY < 0 || gridY >= resolution) {
    return null;
  }

  const terrainHeight = demData[gridY]?.[gridX] ?? 0;
  const depth = terrainHeight - worldZ;

  for (const layer of layers) {
    if (depth >= layer.depth && depth < layer.depth + layer.thickness) {
      return layer;
    }
  }

  return null;
}

export function computeLayerVolume(
  layer: GeologyLayer,
  terrainData: TerrainData,
  sampleStep: number = 8
): number {
  const { demData, resolution, bounds } = terrainData;
  const layerDepths = generateGeologyLayerDepths(resolution, layer.depth, 3);
  
  const width = (bounds.maxX - bounds.minX) / resolution;
  const areaPerCell = width * width;
  
  let volume = 0;
  
  for (let y = 0; y < resolution; y += sampleStep) {
    for (let x = 0; x < resolution; x += sampleStep) {
      const layerDepthVal = layerDepths[y]?.[x] ?? layer.depth;
      volume += layer.thickness * areaPerCell * sampleStep * sampleStep;
    }
  }
  
  return volume;
}
