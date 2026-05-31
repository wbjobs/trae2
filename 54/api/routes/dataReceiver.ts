import { Router, Request, Response } from 'express';
import { SensorData } from '../../shared/types';
import { dataStore } from '../data/dataStore';
import { generateSensorData } from '../data/mockData';

const router = Router();

router.post('/receive', (req: Request, res: Response) => {
  try {
    const data = req.body as SensorData;
    
    if (!data.timestamp || !data.deviceId || !data.location) {
      return res.status(400).json({
        success: false,
        message: '缺少必要字段',
      });
    }

    dataStore.addSensorData(data);
    
    res.json({
      success: true,
      message: '数据接收成功',
    });
  } catch (error) {
    console.error('数据接收错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
    });
  }
});

router.post('/batch', (req: Request, res: Response) => {
  try {
    const dataArray = req.body as SensorData[];
    
    if (!Array.isArray(dataArray)) {
      return res.status(400).json({
        success: false,
        message: '数据格式错误，应为数组',
      });
    }

    dataStore.addSensorDataBatch(dataArray);
    
    res.json({
      success: true,
      message: `成功接收 ${dataArray.length} 条数据`,
    });
  } catch (error) {
    console.error('批量数据接收错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
    });
  }
});

router.get('/realtime', (_req: Request, res: Response) => {
  try {
    const latestData = dataStore.getLatestData(100);
    
    res.json({
      latestData,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('获取实时数据错误:', error);
    res.status(500).json({
      latestData: [],
      timestamp: Date.now(),
    });
  }
});

router.get('/mock', (_req: Request, res: Response) => {
  try {
    const mockData = generateSensorData();
    dataStore.addSensorData(mockData);
    
    res.json({
      success: true,
      data: mockData,
    });
  } catch (error) {
    console.error('生成Mock数据错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
    });
  }
});

router.get('/heatmap/:type', (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const data = dataStore.getLatestData(500);
    
    const heatmapData = data.map((d) => {
      let value = 0;
      switch (type) {
        case 'temperature':
          value = d.temperature;
          break;
        case 'humidity':
          value = d.humidity;
          break;
        case 'co2':
          value = d.gasConcentration.co2;
          break;
        case 'ch4':
          value = d.gasConcentration.ch4;
          break;
        default:
          value = d.temperature;
      }
      return {
        x: d.location.x,
        y: d.location.y,
        value,
      };
    });

    res.json(heatmapData);
  } catch (error) {
    console.error('获取热力图数据错误:', error);
    res.status(500).json([]);
  }
});

router.get('/devices', (_req: Request, res: Response) => {
  try {
    const devices = dataStore.getUniqueDevices();
    const deviceStatuses = devices.map((deviceId) => {
      const deviceData = dataStore.getDataByDevice(deviceId);
      const latest = deviceData[deviceData.length - 1];
      return {
        deviceId,
        status: latest?.deviceStatus || 'unknown',
        location: latest?.location || { x: 0, y: 0, z: 0 },
        lastUpdate: latest?.timestamp || 0,
      };
    });

    res.json(deviceStatuses);
  } catch (error) {
    console.error('获取设备状态错误:', error);
    res.status(500).json([]);
  }
});

export default router;
