import { TerrainData, Bounds } from '../types';

export function generatePerlinTerrain(
  width: number,
  height: number,
  scale: number = 50,
  octaves: number = 4,
  seed: number = Math.random() * 10000
): number[][] {
  const terrain: number[][] = [];
  
  for (let y = 0; y < height; y++) {
    terrain[y] = [];
    for (let x = 0; x < width; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let maxValue = 0;
      
      for (let o = 0; o < octaves; o++) {
        const nx = (x / width) * scale * frequency + seed;
        const ny = (y / height) * scale * frequency + seed;
        value += perlinNoise(nx, ny) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      
      terrain[y][x] = value / maxValue;
    }
  }
  
  return terrain;
}

function perlinNoise(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  
  const u = fade(xf);
  const v = fade(yf);
  
  const aa = hash(X + hash(Y));
  const ab = hash(X + hash(Y + 1));
  const ba = hash(X + 1 + hash(Y));
  const bb = hash(X + 1 + hash(Y + 1));
  
  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
  
  return (lerp(x1, x2, v) + 1) / 2;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function hash(n: number): number {
  return ((n * 2654435761) % 256 + 256) % 256;
}

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function createTerrainData(
  resolution: number = 128,
  heightScale: number = 50,
  seed?: number
): TerrainData {
  const rawData = generatePerlinTerrain(resolution, resolution, 30, 5, seed);
  const demData: number[][] = rawData.map(row => row.map(v => v * heightScale));
  
  let minZ = Infinity;
  let maxZ = -Infinity;
  
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      minZ = Math.min(minZ, demData[y][x]);
      maxZ = Math.max(maxZ, demData[y][x]);
    }
  }
  
  const bounds: Bounds = {
    minX: 0,
    maxX: resolution,
    minY: 0,
    maxY: resolution,
    minZ,
    maxZ,
  };
  
  return {
    id: 'terrain-' + Date.now(),
    demData,
    resolution,
    bounds,
  };
}

export function getHeightAt(
  terrainData: TerrainData,
  x: number,
  y: number
): number | null {
  const { demData, resolution, bounds } = terrainData;
  
  const gridX = Math.floor((x - bounds.minX) / (bounds.maxX - bounds.minX) * (resolution - 1));
  const gridY = Math.floor((y - bounds.minY) / (bounds.maxY - bounds.minY) * (resolution - 1));
  
  if (gridX < 0 || gridX >= resolution || gridY < 0 || gridY >= resolution) {
    return null;
  }
  
  return demData[gridY][gridX];
}

export function getTerrainHeightColor(height: number, minZ: number, maxZ: number): string {
  const normalizedHeight = (height - minZ) / (maxZ - minZ);
  
  const colors = [
    { pos: 0.0, color: [64, 96, 64] },
    { pos: 0.25, color: [96, 128, 80] },
    { pos: 0.5, color: [160, 144, 96] },
    { pos: 0.75, color: [128, 128, 128] },
    { pos: 1.0, color: [240, 240, 240] },
  ];
  
  let lower = colors[0];
  let upper = colors[colors.length - 1];
  
  for (let i = 0; i < colors.length - 1; i++) {
    if (normalizedHeight >= colors[i].pos && normalizedHeight <= colors[i + 1].pos) {
      lower = colors[i];
      upper = colors[i + 1];
      break;
    }
  }
  
  const t = (normalizedHeight - lower.pos) / (upper.pos - lower.pos);
  const r = Math.round(lerp(lower.color[0], upper.color[0], t));
  const g = Math.round(lerp(lower.color[1], upper.color[1], t));
  const b = Math.round(lerp(lower.color[2], upper.color[2], t));
  
  return `rgb(${r}, ${g}, ${b})`;
}
