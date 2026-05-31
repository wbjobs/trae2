import { Router, Request, Response } from 'express';
import { riskService } from '../services/RiskService.js';
import { TimeRange, DeviceType } from '../../shared/types.js';

const router = Router();

router.get('/heatmap', (req: Request, res: Response) => {
  try {
    const timeRange = (req.query.timeRange as TimeRange) || '24h';
    const area = req.query.area as string | undefined;
    const deviceType = req.query.deviceType as DeviceType | undefined;

    const heatmapData = riskService.getHeatmapData(timeRange, area, deviceType);

    res.status(200).json({
      success: true,
      data: heatmapData
    });
  } catch (error) {
    console.error('Error getting heatmap data:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/calculate', (req: Request, res: Response) => {
  try {
    const { area, timeRange } = req.query;

    if (!area) {
      return res.status(400).json({
        success: false,
        message: 'Area is required'
      });
    }

    const risk = riskService.calculateRisk(
      area as string,
      (timeRange as TimeRange) || '24h'
    );

    res.status(200).json({
      success: true,
      data: risk
    });
  } catch (error) {
    console.error('Error calculating risk:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/areas', (req: Request, res: Response) => {
  try {
    const timeRange = (req.query.timeRange as TimeRange) || '24h';
    const risks = riskService.getAllAreaRisks(timeRange);

    res.status(200).json({
      success: true,
      data: risks,
      total: risks.length
    });
  } catch (error) {
    console.error('Error getting area risks:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/hourly', (req: Request, res: Response) => {
  try {
    const area = req.query.area as string | undefined;
    const hourlyData = riskService.getHourlyRiskData(area);

    res.status(200).json({
      success: true,
      data: hourlyData
    });
  } catch (error) {
    console.error('Error getting hourly risk data:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/device-health', (req: Request, res: Response) => {
  try {
    const healthData = riskService.getDeviceHealthByArea();

    res.status(200).json({
      success: true,
      data: healthData
    });
  } catch (error) {
    console.error('Error getting device health:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/top-areas', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const timeRange = (req.query.timeRange as TimeRange) || '24h';

    const topAreas = riskService.getTopRiskAreas(limit, timeRange);

    res.status(200).json({
      success: true,
      data: topAreas
    });
  } catch (error) {
    console.error('Error getting top risk areas:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/overall', (req: Request, res: Response) => {
  try {
    const timeRange = (req.query.timeRange as TimeRange) || '24h';
    const stats = riskService.getOverallStats(timeRange);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting overall stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
