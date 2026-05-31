import type { DEMData } from '../../src/types/index.js';

class SimplexNoise {
  private perm: number[];
  private gradP: { x: number; y: number; z: number }[];

  private grad3 = [
    { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: -1, y: -1, z: 0 },
    { x: 1, y: 0, z: 1 }, { x: -1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 }, { x: -1, y: 0, z: -1 },
    { x: 0, y: 1, z: 1 }, { x: 0, y: -1, z: 1 }, { x: 0, y: 1, z: -1 }, { x: 0, y: -1, z: -1 }
  ];

  constructor(seed: number = Math.random()) {
    const p: number[] = [];
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    
    let n: number;
    let q: number;
    for (let i = 255; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      n = seed % (i + 1);
      q = p[i];
      p[i] = p[n];
      p[n] = q;
    }

    this.perm = new Array(512);
    this.gradP = new Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.gradP[i] = this.grad3[this.perm[i] % 12];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return (1 - t) * a + t * b;
  }

  noise2D(x: number, y: number): number {
    let X = Math.floor(x);
    let Y = Math.floor(y);
    
    x = x - X;
    y = y - Y;
    
    X = X & 255;
    Y = Y & 255;
    
    const n00 = this.dotGridGradient(X, Y, x, y);
    const n01 = this.dotGridGradient(X, Y + 1, x, y - 1);
    const n10 = this.dotGridGradient(X + 1, Y, x - 1, y);
    const n11 = this.dotGridGradient(X + 1, Y + 1, x - 1, y - 1);
    
    const u = this.fade(x);
    const v = this.fade(y);
    
    const nx0 = this.lerp(n00, n10, u);
    const nx1 = this.lerp(n01, n11, u);
    
    return this.lerp(nx0, nx1, v);
  }

  private dotGridGradient(ix: number, iy: number, x: number, y: number): number {
    const gradient = this.gradP[ix + this.perm[iy]];
    return (x * gradient.x + y * gradient.y);
  }
}

export interface DEMGeneratorOptions {
  width?: number;
  height?: number;
  minLon?: number;
  minLat?: number;
  maxLon?: number;
  maxLat?: number;
  baseElevation?: number;
  amplitude?: number;
  seed?: number;
}

export function generateDEM(options: DEMGeneratorOptions = {}): DEMData {
  const {
    width = 64,
    height = 64,
    minLon = 116.38,
    minLat = 39.895,
    maxLon = 116.42,
    maxLat = 39.93,
    baseElevation = 40,
    amplitude = 30,
    seed = 42
  } = options;

  const noise = new SimplexNoise(seed);
  const elevations: number[] = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const nx = col / width;
      const ny = row / height;

      let elevation = 0;
      
      elevation += noise.noise2D(nx * 2, ny * 2) * 0.5;
      elevation += noise.noise2D(nx * 4, ny * 4) * 0.25;
      elevation += noise.noise2D(nx * 8, ny * 8) * 0.125;
      elevation += noise.noise2D(nx * 16, ny * 16) * 0.0625;

      elevation = (elevation + 1) / 2;
      
      const centerDist = Math.sqrt(Math.pow(nx - 0.5, 2) + Math.pow(ny - 0.5, 2));
      const valleyFactor = Math.max(0, 1 - centerDist * 1.5);
      elevation -= valleyFactor * 0.3;

      const finalElevation = baseElevation + elevation * amplitude;
      
      elevations.push(Math.round(finalElevation * 100) / 100);
    }
  }

  return {
    width,
    height,
    minLon,
    minLat,
    maxLon,
    maxLat,
    elevations
  };
}

export function getElevationAt(
  dem: DEMData,
  lon: number,
  lat: number
): number | null {
  if (lon < dem.minLon || lon > dem.maxLon || lat < dem.minLat || lat > dem.maxLat) {
    return null;
  }

  const x = ((lon - dem.minLon) / (dem.maxLon - dem.minLon)) * (dem.width - 1);
  const y = ((lat - dem.minLat) / (dem.maxLat - dem.minLat)) * (dem.height - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, dem.width - 1);
  const y1 = Math.min(y0 + 1, dem.height - 1);

  const fx = x - x0;
  const fy = y - y0;

  const h00 = dem.elevations[y0 * dem.width + x0];
  const h10 = dem.elevations[y0 * dem.width + x1];
  const h01 = dem.elevations[y1 * dem.width + x0];
  const h11 = dem.elevations[y1 * dem.width + x1];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  const h = h0 * (1 - fy) + h1 * fy;

  return Math.round(h * 100) / 100;
}
