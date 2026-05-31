interface TerrainWorkerMessage {
  type: 'generate' | 'getHeight' | 'getSlope';
  data: any;
}

interface GenerateRequest {
  resolution: number;
  heightScale: number;
  seed: number;
}

interface GenerateResponse {
  demData: number[][];
  resolution: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

interface GetHeightRequest {
  demData: number[][];
  resolution: number;
  x: number;
  y: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

interface GetHeightResponse {
  height: number | null;
}

interface GetSlopeRequest {
  demData: number[][];
  resolution: number;
  x: number;
  y: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  cellSize: number;
}

interface GetSlopeResponse {
  slope: number | null;
  aspect: number | null;
}

function generatePerlinNoise(
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
        value += perlinNoise2D(nx, ny) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      
      terrain[y][x] = value / maxValue;
    }
  }
  
  return terrain;
}

function perlinNoise2D(x: number, y: number): number {
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

function grad(h: number, x: number, y: number): number {
  const h2 = h & 3;
  const u = h2 < 2 ? x : y;
  const v = h2 < 2 ? y : x;
  return ((h2 & 1) === 0 ? u : -u) + ((h2 & 2) === 0 ? v : -v);
}

function handleGenerate(request: GenerateRequest): GenerateResponse {
  const { resolution, heightScale, seed } = request;
  const rawData = generatePerlinNoise(resolution, resolution, 30, 5, seed);
  const demData: number[][] = rawData.map(row => row.map(v => v * heightScale));
  
  let minZ = Infinity;
  let maxZ = -Infinity;
  
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      minZ = Math.min(minZ, demData[y][x]);
      maxZ = Math.max(maxZ, demData[y][x]);
    }
  }
  
  return {
    demData,
    resolution,
    bounds: {
      minX: 0,
      maxX: resolution,
      minY: 0,
      maxY: resolution,
      minZ,
      maxZ,
    },
  };
}

function handleGetHeight(request: GetHeightRequest): GetHeightResponse {
  const { demData, resolution, x, y, bounds } = request;
  
  const gridX = Math.floor(((x - bounds.minX) / (bounds.maxX - bounds.minX)) * (resolution - 1));
  const gridY = Math.floor(((y - bounds.minY) / (bounds.maxY - bounds.minY)) * (resolution - 1));
  
  if (gridX < 0 || gridX >= resolution || gridY < 0 || gridY >= resolution) {
    return { height: null };
  }
  
  return { height: demData[gridY]?.[gridX] ?? null };
}

function handleGetSlope(request: GetSlopeRequest): GetSlopeResponse {
  const { demData, resolution, x, y, bounds, cellSize } = request;
  
  const gridX = Math.floor(((x - bounds.minX) / (bounds.maxX - bounds.minX)) * (resolution - 1));
  const gridY = Math.floor(((y - bounds.minY) / (bounds.maxY - bounds.minY)) * (resolution - 1));
  
  if (gridX < 1 || gridX >= resolution - 1 || gridY < 1 || gridY >= resolution - 1) {
    return { slope: null, aspect: null };
  }
  
  const dzdx = (demData[gridY][gridX + 1] - demData[gridY][gridX - 1]) / (2 * cellSize);
  const dzdy = (demData[gridY + 1][gridX] - demData[gridY - 1][gridX]) / (2 * cellSize);
  
  const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  const slope = (slopeRad * 180) / Math.PI;
  
  const aspectRad = Math.atan2(dzdy, -dzdx);
  const aspect = ((aspectRad * 180) / Math.PI + 360) % 360;
  
  return { slope, aspect };
}

self.onmessage = (event: MessageEvent<TerrainWorkerMessage>) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'generate':
      const generateResult = handleGenerate(data as GenerateRequest);
      self.postMessage({ type: 'generate', data: generateResult });
      break;
      
    case 'getHeight':
      const heightResult = handleGetHeight(data as GetHeightRequest);
      self.postMessage({ type: 'getHeight', data: heightResult });
      break;
      
    case 'getSlope':
      const slopeResult = handleGetSlope(data as GetSlopeRequest);
      self.postMessage({ type: 'getSlope', data: slopeResult });
      break;
  }
};
