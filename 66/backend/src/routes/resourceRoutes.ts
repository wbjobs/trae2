import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as resourceService from '../services/resourceService';
import { reverseGeocode, parseCoordinates } from '../services/geocodeService';

const router = Router();

const resourceSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  scientific_name: z.string().min(1, '学名不能为空'),
  category_id: z.union([z.string(), z.null()]).optional(),
  family: z.union([z.string(), z.null()]).optional(),
  genus: z.union([z.string(), z.null()]).optional(),
  species: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  origin: z.union([z.string(), z.null()]).optional(),
  habitat: z.union([z.string(), z.null()]).optional(),
  protection_level: z.union([z.string(), z.null()]).optional(),
  latitude: z.union([z.number(), z.null()]).optional(),
  longitude: z.union([z.number(), z.null()]).optional(),
  altitude: z.union([z.number(), z.null()]).optional(),
  address: z.union([z.string(), z.null()]).optional(),
  province: z.union([z.string(), z.null()]).optional(),
  city: z.union([z.string(), z.null()]).optional(),
  district: z.union([z.string(), z.null()]).optional(),
  surveyor: z.union([z.string(), z.null()]).optional(),
  survey_date: z.union([z.string(), z.null()]).optional()
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = resourceService.getResources({
      page: parseInt(req.query.page as string) || 1,
      page_size: parseInt(req.query.page_size as string) || 20,
      category_id: req.query.category_id as string | undefined,
      search: req.query.search as string | undefined,
      province: req.query.province as string | undefined,
      city: req.query.city as string | undefined,
      protection_level: req.query.protection_level as string | undefined,
      sort_by: req.query.sort_by as string | undefined,
      sort_order: (req.query.sort_order as 'asc' | 'desc') || 'desc'
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = resourceService.getResourceStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/distribution/heatmap', async (req: Request, res: Response) => {
  try {
    const result = resourceService.getDistributionHeatmap({
      category_id: req.query.category_id as string | undefined,
      protection_level: req.query.protection_level as string | undefined
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/distribution/provinces', async (_req: Request, res: Response) => {
  try {
    const result = resourceService.getProvinceDistribution();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/ranking/growth-performance', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const result = resourceService.getGrowthPerformanceRanking(limit);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const resource = resourceService.getResourceById(req.params.id);
    if (!resource) {
      return res.status(404).json({ success: false, error: '资源不存在' });
    }
    res.json({ success: true, data: resource });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const rawData = req.body;
    const sanitizedData: any = {};
    
    Object.keys(rawData).forEach(key => {
      const value = rawData[key];
      if (value === '' || value === undefined) {
        sanitizedData[key] = null;
      } else {
        sanitizedData[key] = value;
      }
    });

    const validated = resourceSchema.parse(sanitizedData);

    let data = { ...validated };

    if (data.latitude && data.longitude) {
      const geoResult = await reverseGeocode({
        latitude: data.latitude,
        longitude: data.longitude
      });

      if (geoResult) {
        if (!data.province) data.province = geoResult.province;
        if (!data.city) data.city = geoResult.city;
        if (!data.district) data.district = geoResult.district;
        if (!data.address) data.address = geoResult.formatted_address;
      }
    }

    const resource = resourceService.createResource(data);
    res.status(201).json({ success: true, data: resource });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: '数据验证失败',
        details: error.errors
      });
    }
    console.error('Create resource error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const rawData = req.body;
    const sanitizedData: any = {};
    
    Object.keys(rawData).forEach(key => {
      const value = rawData[key];
      if (value === '' || value === undefined) {
        sanitizedData[key] = null;
      } else {
        sanitizedData[key] = value;
      }
    });

    const validated = resourceSchema.partial().parse(sanitizedData);
    const resource = resourceService.updateResource(req.params.id, validated);

    if (!resource) {
      return res.status(404).json({ success: false, error: '资源不存在' });
    }

    res.json({ success: true, data: resource });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: '数据验证失败',
        details: error.errors
      });
    }
    console.error('Update resource error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = resourceService.deleteResource(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '资源不存在' });
    }
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/geocode', async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, coord_string } = req.body;

    let lat: number, lon: number;

    if (coord_string) {
      const coords = parseCoordinates(coord_string);
      if (!coords) {
        return res.status(400).json({ success: false, error: '无法解析坐标字符串' });
      }
      lat = coords.latitude;
      lon = coords.longitude;
    } else if (latitude !== undefined && longitude !== undefined) {
      lat = parseFloat(latitude);
      lon = parseFloat(longitude);
    } else {
      return res.status(400).json({ success: false, error: '缺少坐标参数' });
    }

    const result = await reverseGeocode({ latitude: lat, longitude: lon });

    if (!result) {
      return res.json({
        success: false,
        message: '地理编码服务不可用，请检查API密钥配置'
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
