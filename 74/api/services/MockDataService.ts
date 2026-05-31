import { dataReceiverService } from './DataReceiverService.js';
import { Device, DeviceType, DataStatus, SecurityData } from '../../shared/types.js';

const deviceTypeMap: Record<DeviceType, { minValue: number; maxValue: number; anomalyChance: number }> = {
  camera: { minValue: 10, maxValue: 100, anomalyChance: 0.08 },
  access: { minValue: 0, maxValue: 50, anomalyChance: 0.05 },
  alarm: { minValue: 0, maxValue: 10, anomalyChance: 0.15 }
};

const anomalyTypeByDevice: Record<DeviceType, string[]> = {
  camera: ['人群聚集', '异常入侵', '移动侦测'],
  access: ['非法闯入', '门禁异常', '高峰拥堵'],
  alarm: ['烟雾报警', '紧急按钮', '设备故障']
};

function generateValue(deviceType: DeviceType): { value: number; status: DataStatus } {
  const config = deviceTypeMap[deviceType];
  const isAnomaly = Math.random() < config.anomalyChance;

  if (isAnomaly) {
    const isDanger = Math.random() < 0.4;
    return {
      value: config.maxValue + Math.random() * config.maxValue * 0.5,
      status: isDanger ? 'danger' : 'warning'
    };
  }

  return {
    value: config.minValue + Math.random() * (config.maxValue - config.minValue),
    status: 'normal'
  };
}

function getRandomOffset(): { latOffset: number; lngOffset: number } {
  return {
    latOffset: (Math.random() - 0.5) * 0.02,
    lngOffset: (Math.random() - 0.5) * 0.02
  };
}

export class MockDataService {
  private devices: Device[] = [];
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  async start(intervalMs: number = 2000) {
    if (this.isRunning) return;

    this.devices = dataReceiverService.getDevices();
    if (this.devices.length === 0) {
      console.warn('No devices found, mock data service cannot start');
      return;
    }

    this.isRunning = true;
    console.log(`Mock data service started, generating data every ${intervalMs}ms`);

    this.generateData();
    this.intervalId = setInterval(() => this.generateData(), intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('Mock data service stopped');
  }

  private generateData() {
    if (!this.isRunning || this.devices.length === 0) return;

    const count = Math.floor(Math.random() * 3) + 1;
    const selectedDevices = this.shuffleArray([...this.devices]).slice(0, count);

    selectedDevices.forEach(device => {
      const { value, status } = generateValue(device.type);
      const { latOffset, lngOffset } = getRandomOffset();

      const data: Omit<SecurityData, 'id'> = {
        deviceId: device.id,
        deviceType: device.type,
        timestamp: Date.now(),
        location: {
          lat: device.lat + latOffset,
          lng: device.lng + lngOffset,
          area: device.areaCode
        },
        value: Math.round(value * 10) / 10,
        status,
        metadata: status !== 'normal' ? {
          anomalyType: anomalyTypeByDevice[device.type][Math.floor(Math.random() * anomalyTypeByDevice[device.type].length)],
          confidence: 0.7 + Math.random() * 0.3
        } : undefined
      };

      dataReceiverService.receiveData(data);
    });
  }

  generateHistoricalData(hours: number = 24) {
    const now = Date.now();
    const startTime = now - hours * 60 * 60 * 1000;
    const interval = 5 * 60 * 1000;

    console.log(`Generating ${hours} hours of historical data...`);

    for (let t = startTime; t < now; t += interval) {
      this.devices.forEach(device => {
        if (Math.random() < 0.7) {
          const hourOfDay = new Date(t).getHours();
          const dayFactor = (hourOfDay >= 7 && hourOfDay <= 21) ? 1.5 : 0.5;

          const { value, status } = generateValue(device.type);
          const { latOffset, lngOffset } = getRandomOffset();

          const data: Omit<SecurityData, 'id'> = {
            deviceId: device.id,
            deviceType: device.type,
            timestamp: t,
            location: {
              lat: device.lat + latOffset,
              lng: device.lng + lngOffset,
              area: device.areaCode
            },
            value: Math.round(value * dayFactor * 10) / 10,
            status
          };

          dataReceiverService.receiveData(data);
        }
      });
    }

    console.log('Historical data generation completed');
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

export const mockDataService = new MockDataService();
export default mockDataService;
