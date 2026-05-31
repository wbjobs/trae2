import { SensorData } from '../../shared/types';

const deviceConfigs = [
  { deviceId: 'DEV-001', x: 10, y: 20, baseTemp: 22, baseHumidity: 55 },
  { deviceId: 'DEV-002', x: 30, y: 20, baseTemp: 23, baseHumidity: 58 },
  { deviceId: 'DEV-003', x: 50, y: 20, baseTemp: 21, baseHumidity: 52 },
  { deviceId: 'DEV-004', x: 70, y: 20, baseTemp: 24, baseHumidity: 60 },
  { deviceId: 'DEV-005', x: 90, y: 20, baseTemp: 22, baseHumidity: 54 },
  { deviceId: 'DEV-006', x: 10, y: 50, baseTemp: 23, baseHumidity: 57 },
  { deviceId: 'DEV-007', x: 30, y: 50, baseTemp: 25, baseHumidity: 62 },
  { deviceId: 'DEV-008', x: 50, y: 50, baseTemp: 22, baseHumidity: 55 },
  { deviceId: 'DEV-009', x: 70, y: 50, baseTemp: 21, baseHumidity: 53 },
  { deviceId: 'DEV-010', x: 90, y: 50, baseTemp: 24, baseHumidity: 59 },
  { deviceId: 'DEV-011', x: 10, y: 80, baseTemp: 22, baseHumidity: 56 },
  { deviceId: 'DEV-012', x: 30, y: 80, baseTemp: 23, baseHumidity: 57 },
  { deviceId: 'DEV-013', x: 50, y: 80, baseTemp: 26, baseHumidity: 65 },
  { deviceId: 'DEV-014', x: 70, y: 80, baseTemp: 22, baseHumidity: 54 },
  { deviceId: 'DEV-015', x: 90, y: 80, baseTemp: 23, baseHumidity: 58 },
];

function randomNormal(mean: number, std: number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function generateSensorData(timestamp?: number): SensorData {
  const config = deviceConfigs[Math.floor(Math.random() * deviceConfigs.length)];
  const time = timestamp || Date.now();
  
  const hourOfDay = new Date(time).getHours();
  const tempVariation = Math.sin((hourOfDay / 24) * Math.PI * 2) * 3;
  
  const temperature = Math.max(
    15,
    Math.min(40, randomNormal(config.baseTemp + tempVariation, 1.5))
  );
  const humidity = Math.max(30, Math.min(80, randomNormal(config.baseHumidity, 5)));
  
  let deviceStatus: 'normal' | 'warning' | 'error' = 'normal';
  const statusRand = Math.random();
  if (statusRand > 0.97) {
    deviceStatus = 'error';
  } else if (statusRand > 0.9) {
    deviceStatus = 'warning';
  }

  let co2 = randomNormal(600, 150);
  let ch4 = randomNormal(5, 2);
  let o2 = randomNormal(20.9, 0.5);

  if (deviceStatus === 'error') {
    co2 = randomNormal(2000, 500);
    ch4 = randomNormal(50, 20);
  } else if (deviceStatus === 'warning') {
    co2 = randomNormal(1200, 300);
    ch4 = randomNormal(20, 10);
  }

  return {
    timestamp: time,
    deviceId: config.deviceId,
    location: { x: config.x, y: config.y, z: 0 },
    temperature: parseFloat(temperature.toFixed(1)),
    humidity: parseFloat(humidity.toFixed(1)),
    gasConcentration: {
      co2: parseFloat(co2.toFixed(1)),
      ch4: parseFloat(ch4.toFixed(2)),
      o2: parseFloat(o2.toFixed(2)),
    },
    deviceStatus,
  };
}

export function generateHistoricalData(hours: number = 24): SensorData[] {
  const data: SensorData[] = [];
  const now = Date.now();
  const interval = 5 * 60 * 1000;
  const points = (hours * 60 * 60 * 1000) / interval;

  for (let i = 0; i < points; i++) {
    const timestamp = now - (points - i) * interval;
    deviceConfigs.forEach((config) => {
      const time = timestamp;
      const hourOfDay = new Date(time).getHours();
      const tempVariation = Math.sin((hourOfDay / 24) * Math.PI * 2) * 3;

      const temperature = Math.max(
        15,
        Math.min(40, randomNormal(config.baseTemp + tempVariation, 1.5))
      );
      const humidity = Math.max(30, Math.min(80, randomNormal(config.baseHumidity, 5)));

      let deviceStatus: 'normal' | 'warning' | 'error' = 'normal';
      const statusRand = Math.random();
      if (statusRand > 0.98) {
        deviceStatus = 'error';
      } else if (statusRand > 0.92) {
        deviceStatus = 'warning';
      }

      let co2 = randomNormal(600, 150);
      let ch4 = randomNormal(5, 2);
      let o2 = randomNormal(20.9, 0.5);

      if (deviceStatus === 'error') {
        co2 = randomNormal(2000, 500);
        ch4 = randomNormal(50, 20);
      } else if (deviceStatus === 'warning') {
        co2 = randomNormal(1200, 300);
        ch4 = randomNormal(20, 10);
      }

      data.push({
        timestamp: time,
        deviceId: config.deviceId,
        location: { x: config.x, y: config.y, z: 0 },
        temperature: parseFloat(temperature.toFixed(1)),
        humidity: parseFloat(humidity.toFixed(1)),
        gasConcentration: {
          co2: parseFloat(co2.toFixed(1)),
          ch4: parseFloat(ch4.toFixed(2)),
          o2: parseFloat(o2.toFixed(2)),
        },
        deviceStatus,
      });
    });
  }

  return data;
}

export function getDeviceConfigs() {
  return deviceConfigs;
}
