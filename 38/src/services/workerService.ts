import TerrainWorker from '../workers/terrainWorker?worker';

let terrainWorker: Worker | null = null;
const pendingRequests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }> = new Map();

function getTerrainWorker(): Worker {
  if (!terrainWorker) {
    terrainWorker = new TerrainWorker();
    terrainWorker.onmessage = (event) => {
      const { id, type, data, error } = event.data;
      const request = pendingRequests.get(id);
      
      if (request) {
        if (error) {
          request.reject(error);
        } else {
          request.resolve(data);
        }
        pendingRequests.delete(id);
      }
    };
    terrainWorker.onerror = (error) => {
      console.error('Terrain worker error:', error);
      pendingRequests.forEach((request) => {
        request.reject(error);
      });
      pendingRequests.clear();
    };
  }
  return terrainWorker;
}

function sendWorkerMessage<T>(type: string, data: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = `${type}-${Date.now()}-${Math.random()}`;
    pendingRequests.set(id, { resolve, reject });
    
    const worker = getTerrainWorker();
    worker.postMessage({ id, type, data });
  });
}

export async function generateTerrainData(
  resolution: number,
  heightScale: number,
  seed: number
): Promise<{
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
}> {
  return sendWorkerMessage('generate', { resolution, heightScale, seed });
}

export async function getTerrainHeight(
  demData: number[][],
  resolution: number,
  x: number,
  y: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): Promise<number | null> {
  const result = await sendWorkerMessage<{ height: number | null }>('getHeight', {
    demData,
    resolution,
    x,
    y,
    bounds,
  });
  return result.height;
}

export async function getTerrainSlope(
  demData: number[][],
  resolution: number,
  x: number,
  y: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  cellSize: number
): Promise<{ slope: number | null; aspect: number | null }> {
  return sendWorkerMessage('getSlope', {
    demData,
    resolution,
    x,
    y,
    bounds,
    cellSize,
  });
}

export function terminateTerrainWorker() {
  if (terrainWorker) {
    terrainWorker.terminate();
    terrainWorker = null;
    pendingRequests.clear();
  }
}

export function createGeometryWorker() {
  return new Worker(
    new URL('../workers/geometryWorker.ts', import.meta.url),
    { type: 'module' }
  );
}

interface GeometryWorkerMessage {
  type: 'generateLayer' | 'computeVolume';
  data: any;
}

let geometryWorker: Worker | null = null;

export function getGeometryWorker(): Worker {
  if (!geometryWorker) {
    geometryWorker = new Worker(
      new URL('../workers/geometryWorker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return geometryWorker;
}

export function terminateGeometryWorker() {
  if (geometryWorker) {
    geometryWorker.terminate();
    geometryWorker = null;
  }
}
