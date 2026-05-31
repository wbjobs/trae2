import { v4 as uuidv4 } from 'uuid';
import { dataRepository } from '../repositories/DataRepository.js';
import { realtimeDataCache, alertCache, deviceCache } from '../cache/index.js';
import { SecurityData, Device, DeviceType, DataStatus } from '../../shared/types.js';
import { broadcastRealtimeData } from '../websocket/index.js';

export class DataReceiverService {
  async receiveData(data: Omit<SecurityData, 'id'>): Promise<{ success: boolean; message: string; dataId: string }> {
    try {
      const device = dataRepository.getDeviceById(data.deviceId);
      if (!device) {
        return { success: false, message: 'Device not found', dataId: '' };
      }

      const id = dataRepository.insertData(data);
      const fullData: SecurityData = {
        ...data,
        id
      };

      realtimeDataCache.set(id, fullData);
      broadcastRealtimeData({ type: 'data', data: fullData, device });

      return { success: true, message: 'Data received successfully', dataId: id };
    } catch (error) {
      console.error('Error receiving data:', error);
      return { success: false, message: 'Internal server error', dataId: '' };
    }
  }

  getRealtimeData(limit: number = 100, deviceType?: DeviceType): SecurityData[] {
    const cached = realtimeDataCache.values();
    if (cached.length >= limit && !deviceType) {
      return cached.slice(0, limit);
    }
    return dataRepository.getRealtimeData(limit, deviceType);
  }

  getHistoricalData(
    startTime: number,
    endTime: number,
    deviceId?: string,
    area?: string
  ): SecurityData[] {
    return dataRepository.getHistoricalData(startTime, endTime, deviceId, area);
  }

  getDevices(): Device[] {
    const cacheKey = 'all_devices';
    const cached = deviceCache.get(cacheKey);
    if (cached) return cached;

    const devices = dataRepository.getDevices();
    deviceCache.set(cacheKey, devices);
    return devices;
  }

  getDeviceStatusStats() {
    const devices = this.getDevices();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const recentData = dataRepository.getHistoricalData(oneDayAgo, now);
    const todayAlerts = recentData.filter(d => d.status !== 'normal').length;

    const stats = {
      total: devices.length,
      online: 0,
      offline: 0,
      fault: 0,
      byType: {
        camera: { total: 0, online: 0 },
        access: { total: 0, online: 0 },
        alarm: { total: 0, online: 0 }
      } as Record<DeviceType, { total: number; online: number }>,
      camera: { total: 0, online: 0 },
      access: { total: 0, online: 0 },
      alarm: { total: 0, online: 0 },
      todayAlerts
    };

    devices.forEach(device => {
      if (device.status === 'online') stats.online++;
      else if (device.status === 'offline') stats.offline++;
      else if (device.status === 'fault') stats.fault++;

      stats.byType[device.type].total++;
      stats[device.type].total++;
      if (device.status === 'online') {
        stats.byType[device.type].online++;
        stats[device.type].online++;
      }
    });

    return stats;
  }

  getDataCountByStatus(startTime?: number, endTime?: number) {
    return dataRepository.getDataCountByStatus(startTime, endTime);
  }

  getAreas() {
    return dataRepository.getAreas();
  }
}

export const dataReceiverService = new DataReceiverService();
export default dataReceiverService;
