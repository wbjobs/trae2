import { Router, type Request, type Response } from 'express';
import {
  getCoordinateSystems,
  batchTransform,
  singleTransform,
  isValidCRS,
  type TransformRequest
} from '../services/coordinateService.js';

const router = Router();

router.get('/systems', (req: Request, res: Response): void => {
  const systems = getCoordinateSystems();
  res.json({
    success: true,
    data: systems,
    count: systems.length
  });
});

router.post('/transform', (req: Request, res: Response): void => {
  const { coordinates, from, to } = req.body as Partial<TransformRequest>;

  if (!coordinates || !from || !to) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: coordinates, from, to'
    });
    return;
  }

  if (!isValidCRS(from)) {
    res.status(400).json({
      success: false,
      error: `Invalid source coordinate system: ${from}. Must be one of: WGS84, GCJ02, BD09, XIAN80, BJ54`
    });
    return;
  }

  if (!isValidCRS(to)) {
    res.status(400).json({
      success: false,
      error: `Invalid target coordinate system: ${to}. Must be one of: WGS84, GCJ02, BD09, XIAN80, BJ54`
    });
    return;
  }

  if (!Array.isArray(coordinates)) {
    res.status(400).json({
      success: false,
      error: 'Coordinates must be an array of [lon, lat] pairs'
    });
    return;
  }

  const isSinglePoint = coordinates.length === 2 && 
                        typeof coordinates[0] === 'number' && 
                        typeof coordinates[1] === 'number';

  try {
    if (isSinglePoint) {
      const result = singleTransform(coordinates as unknown as [number, number], from, to);
      res.json({
        success: true,
        data: result,
        message: 'Coordinate transformed successfully'
      });
    } else {
      const invalidCoords = coordinates.some(
        coord => !Array.isArray(coord) || coord.length < 2 || 
                  typeof coord[0] !== 'number' || typeof coord[1] !== 'number'
      );

      if (invalidCoords) {
        res.status(400).json({
          success: false,
          error: 'All coordinates must be [lon, lat] number pairs'
        });
        return;
      }

      const results = batchTransform({
        coordinates: coordinates as [number, number][],
        from,
        to
      });

      res.json({
        success: true,
        data: results,
        count: results.length,
        message: 'Coordinates transformed successfully'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Coordinate transformation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
