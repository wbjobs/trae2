import { Router, Request, Response } from 'express';
import { dataReceiverService } from '../services/DataReceiverService.js';
import { DeviceType } from '../../shared/types.js';

const router = Router();

router.post('/receive', async (req: Request, res: Response) => {
  try {
    const result = await dataReceiverService.receiveData(req.body);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error receiving data:', error);
    res.status(500).json({ success: false, message: 'Internal server error', dataId: '' });
  }
});

router.get('/realtime', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const deviceType = req.query.deviceType as DeviceType | undefined;

    const data = dataReceiverService.getRealtimeData(limit, deviceType);
    res.status(200).json({
      success: true,
      data,
      total: data.length
    });
  } catch (error) {
    console.error('Error getting realtime data:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/history', (req: Request, res: Response) => {
  try {
    const { startTime, endTime, deviceId, area } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'startTime and endTime are required'
      });
    }

    const data = dataReceiverService.getHistoricalData(
      parseInt(startTime as string),
      parseInt(endTime as string),
      deviceId as string | undefined,
      area as string | undefined
    );

    res.status(200).json({
      success: true,
      data,
      total: data.length
    });
  } catch (error) {
    console.error('Error getting history data:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/devices', (req: Request, res: Response) => {
  try {
    const devices = dataReceiverService.getDevices();
    res.status(200).json({
      success: true,
      data: devices
    });
  } catch (error) {
    console.error('Error getting devices:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/devices/status', (req: Request, res: Response) => {
  try {
    const stats = dataReceiverService.getDeviceStatusStats();
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting device status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/areas', (req: Request, res: Response) => {
  try {
    const areas = dataReceiverService.getAreas();
    res.status(200).json({
      success: true,
      data: areas
    });
  } catch (error) {
    console.error('Error getting areas:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/count', (req: Request, res: Response) => {
  try {
    const { startTime, endTime } = req.query;
    const counts = dataReceiverService.getDataCountByStatus(
      startTime ? parseInt(startTime as string) : undefined,
      endTime ? parseInt(endTime as string) : undefined
    );
    res.status(200).json({
      success: true,
      data: counts
    });
  } catch (error) {
    console.error('Error getting data count:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
