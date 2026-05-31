import { Router, type Request, type Response } from 'express';
import { generateDEM, getElevationAt } from '../data/terrainGenerator.js';
import type { DEMData } from '../../src/types/index.js';

const router = Router();

let cachedDEM: DEMData | null = null;

function getOrCreateDEM(): DEMData {
  if (!cachedDEM) {
    cachedDEM = generateDEM({
      width: 64,
      height: 64,
      minLon: 116.38,
      minLat: 39.895,
      maxLon: 116.42,
      maxLat: 39.93,
      baseElevation: 40,
      amplitude: 30,
      seed: 42
    });
  }
  return cachedDEM;
}

router.get('/dem', (req: Request, res: Response): void => {
  const width = parseInt(req.query.width as string) || 64;
  const height = parseInt(req.query.height as string) || 64;
  const seed = parseInt(req.query.seed as string) || 42;
  const baseElevation = parseFloat(req.query.baseElevation as string) || 40;
  const amplitude = parseFloat(req.query.amplitude as string) || 30;
  const regenerate = req.query.regenerate === 'true';

  const minLon = parseFloat(req.query.minLon as string) || 116.38;
  const minLat = parseFloat(req.query.minLat as string) || 39.895;
  const maxLon = parseFloat(req.query.maxLon as string) || 116.42;
  const maxLat = parseFloat(req.query.maxLat as string) || 39.93;

  let dem: DEMData;

  if (regenerate || !cachedDEM) {
    dem = generateDEM({
      width,
      height,
      minLon,
      minLat,
      maxLon,
      maxLat,
      baseElevation,
      amplitude,
      seed
    });
    cachedDEM = dem;
  } else {
    dem = getOrCreateDEM();
  }

  const minElev = Math.min(...dem.elevations);
  const maxElev = Math.max(...dem.elevations);
  const avgElev = dem.elevations.reduce((a, b) => a + b, 0) / dem.elevations.length;

  res.json({
    success: true,
    data: dem,
    metadata: {
      minElevation: Math.round(minElev * 100) / 100,
      maxElevation: Math.round(maxElev * 100) / 100,
      avgElevation: Math.round(avgElev * 100) / 100,
      resolution: `${dem.width}x${dem.height}`,
      bounds: {
        minLon: dem.minLon,
        minLat: dem.minLat,
        maxLon: dem.maxLon,
        maxLat: dem.maxLat
      }
    }
  });
});

router.get('/elevation', (req: Request, res: Response): void => {
  const lon = parseFloat(req.query.lon as string);
  const lat = parseFloat(req.query.lat as string);

  if (isNaN(lon) || isNaN(lat)) {
    res.status(400).json({
      success: false,
      error: 'Missing or invalid query parameters: lon and lat are required and must be numbers'
    });
    return;
  }

  const dem = getOrCreateDEM();
  const elevation = getElevationAt(dem, lon, lat);

  if (elevation === null) {
    res.status(400).json({
      success: false,
      error: `Coordinates (${lon}, ${lat}) are outside the DEM bounds`,
      bounds: {
        minLon: dem.minLon,
        minLat: dem.minLat,
        maxLon: dem.maxLon,
        maxLat: dem.maxLat
      }
    });
    return;
  }

  res.json({
    success: true,
    data: {
      longitude: lon,
      latitude: lat,
      elevation
    }
  });
});

router.post('/elevation/batch', (req: Request, res: Response): void => {
  const { points } = req.body;

  if (!points || !Array.isArray(points)) {
    res.status(400).json({
      success: false,
      error: 'Missing or invalid field: points must be an array of [lon, lat] pairs'
    });
    return;
  }

  const dem = getOrCreateDEM();
  const results = points.map((point: [number, number], index: number) => {
    if (!Array.isArray(point) || point.length < 2) {
      return {
        index,
        longitude: point[0],
        latitude: point[1],
        elevation: null,
        error: 'Invalid point format'
      };
    }

    const [lon, lat] = point;
    const elevation = getElevationAt(dem, lon, lat);

    return {
      index,
      longitude: lon,
      latitude: lat,
      elevation,
      error: elevation === null ? 'Point outside DEM bounds' : null
    };
  });

  const validResults = results.filter((r) => r.elevation !== null);

  res.json({
    success: true,
    data: results,
    count: results.length,
    validCount: validResults.length,
    message: 'Batch elevation query completed'
  });
});

export default router;
