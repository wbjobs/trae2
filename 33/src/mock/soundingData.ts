import { SoundingData, SoundingDataPoint } from '@/types';

const pressureLevels = [1000, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100];

const generateTemperatureProfile = (baseTemp: number, pressure: number): number => {
  const lapseRate = 6.5;
  const height = (1000 - pressure) * 10;
  const temp = baseTemp - (lapseRate * height / 1000);
  return Math.round((temp + (Math.random() - 0.5) * 2) * 10) / 10;
};

const generateDewPoint = (temperature: number, pressure: number): number => {
  const baseHumidity = pressure > 850 ? 60 : pressure > 500 ? 40 : 20;
  const humidity = Math.max(5, Math.min(95, baseHumidity + (Math.random() - 0.5) * 20));
  const es = 6.112 * Math.exp(17.67 * temperature / (temperature + 243.5));
  const e = es * (humidity / 100);
  return Math.round((243.5 * Math.log(e / 6.112)) / (17.67 - Math.log(e / 6.112)) * 10) / 10;
};

const generateWindSpeed = (pressure: number): number => {
  const baseSpeed = pressure > 700 ? 5 : pressure > 300 ? 15 : 25;
  return Math.round((baseSpeed + Math.random() * 15) * 10) / 10;
};

const generateWindDirection = (): number => {
  return Math.round(Math.random() * 360);
};

const generateDataPoints = (baseTemp: number): SoundingDataPoint[] => {
  return pressureLevels.map((pressure, index) => {
    const height = Math.round((1000 - pressure) * 9.5);
    const temperature = generateTemperatureProfile(baseTemp, pressure);
    const dewPoint = generateDewPoint(temperature, pressure);
    const windSpeed = generateWindSpeed(pressure);
    const windDirection = generateWindDirection();
    const uWind = -windSpeed * Math.sin(windDirection * Math.PI / 180);
    const vWind = -windSpeed * Math.cos(windDirection * Math.PI / 180);
    const es = 6.112 * Math.exp(17.67 * temperature / (temperature + 243.5));
    const e = 6.112 * Math.exp(17.67 * dewPoint / (dewPoint + 243.5));
    const relativeHumidity = Math.round((e / es) * 100 * 10) / 10;

    return {
      pressure,
      height,
      temperature,
      dewPoint,
      relativeHumidity,
      windSpeed,
      windDirection,
      uWind: Math.round(uWind * 10) / 10,
      vWind: Math.round(vWind * 10) / 10
    };
  });
};

export const generateMockSoundingData = (stationId: string, stationName: string, dateOffset: number = 0): SoundingData => {
  const baseTemp = 15 + Math.random() * 15;
  const now = new Date();
  now.setHours(now.getHours() + dateOffset * 12);

  return {
    stationId,
    stationName,
    soundingTime: now.toISOString().slice(0, 16).replace('T', ' '),
    releaseTime: now.toISOString().slice(0, 16).replace('T', ' '),
    latitude: 39.8 + Math.random() * 0.5,
    longitude: 116.5 + Math.random() * 0.5,
    elevation: 30 + Math.random() * 10,
    maxHeight: 30000,
    dataPoints: generateDataPoints(baseTemp),
    dataQuality: 'good'
  };
};

export const generateMockSoundingList = (stationId: string, stationName: string, count: number = 10): SoundingData[] => {
  return Array.from({ length: count }, (_, i) =>
    generateMockSoundingData(stationId, stationName, count - i - 1)
  );
};

export const mockSoundingData: SoundingData = generateMockSoundingData('54398', '北京观象台');
export const mockSoundingList: SoundingData[] = generateMockSoundingList('54398', '北京观象台', 15);
