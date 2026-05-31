import { SensorData, AnomalyCluster } from '../../shared/types';
import { queryCache } from '../utils/cacheManager';

class DataStore {
  private sensorData: SensorData[] = [];
  private anomalyClusters: AnomalyCluster[] = [];
  private maxDataPoints = 10000;
  private timeIndex: Map<number, number> = new Map();
  private deviceIndex: Map<string, number[]> = new Map();
  private zoneIndex: Map<string, number[]> = new Map();

  private getZoneKey(x: number, y: number): string {
    const zoneX = Math.floor(x / 25);
    const zoneY = Math.floor(y / 25);
    return `Z-${zoneX}-${zoneY}`;
  }

  addSensorData(data: SensorData): void {
    const newIndex = this.sensorData.length;
    this.sensorData.push(data);

    const hourKey = Math.floor(data.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
    if (!this.timeIndex.has(hourKey)) {
      this.timeIndex.set(hourKey, newIndex);
    }

    if (!this.deviceIndex.has(data.deviceId)) {
      this.deviceIndex.set(data.deviceId, []);
    }
    this.deviceIndex.get(data.deviceId)!.push(newIndex);

    const zoneKey = this.getZoneKey(data.location.x, data.location.y);
    if (!this.zoneIndex.has(zoneKey)) {
      this.zoneIndex.set(zoneKey, []);
    }
    this.zoneIndex.get(zoneKey)!.push(newIndex);

    if (this.sensorData.length > this.maxDataPoints) {
      this.sensorData.shift();
      this.rebuildIndices();
    }

    queryCache.clearByPrefix('agg_');
    queryCache.clearByPrefix('timerange_');
    queryCache.clearByPrefix('latest_');
  }

  addSensorDataBatch(data: SensorData[]): void {
    const startIndex = this.sensorData.length;
    this.sensorData.push(...data);

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const idx = startIndex + i;

      const hourKey = Math.floor(d.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
      if (!this.timeIndex.has(hourKey)) {
        this.timeIndex.set(hourKey, idx);
      }

      if (!this.deviceIndex.has(d.deviceId)) {
        this.deviceIndex.set(d.deviceId, []);
      }
      this.deviceIndex.get(d.deviceId)!.push(idx);

      const zoneKey = this.getZoneKey(d.location.x, d.location.y);
      if (!this.zoneIndex.has(zoneKey)) {
        this.zoneIndex.set(zoneKey, []);
      }
      this.zoneIndex.get(zoneKey)!.push(idx);
    }

    if (this.sensorData.length > this.maxDataPoints) {
      const excess = this.sensorData.length - this.maxDataPoints;
      this.sensorData.splice(0, excess);
      this.rebuildIndices();
    }

    queryCache.clearByPrefix('agg_');
    queryCache.clearByPrefix('timerange_');
    queryCache.clearByPrefix('latest_');
  }

  private rebuildIndices(): void {
    this.timeIndex.clear();
    this.deviceIndex.clear();
    this.zoneIndex.clear();

    for (let i = 0; i < this.sensorData.length; i++) {
      const d = this.sensorData[i];

      const hourKey = Math.floor(d.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
      if (!this.timeIndex.has(hourKey)) {
        this.timeIndex.set(hourKey, i);
      }

      if (!this.deviceIndex.has(d.deviceId)) {
        this.deviceIndex.set(d.deviceId, []);
      }
      this.deviceIndex.get(d.deviceId)!.push(i);

      const zoneKey = this.getZoneKey(d.location.x, d.location.y);
      if (!this.zoneIndex.has(zoneKey)) {
        this.zoneIndex.set(zoneKey, []);
      }
      this.zoneIndex.get(zoneKey)!.push(i);
    }
  }

  getSensorData(limit?: number): SensorData[] {
    if (limit) {
      return this.sensorData.slice(-limit);
    }
    return [...this.sensorData];
  }

  getSensorDataByTimeRange(startTime: number, endTime: number): SensorData[] {
    const cacheKey = `timerange_${startTime}_${endTime}`;
    const cached = queryCache.get<SensorData[]>(cacheKey);
    if (cached) return cached;

    let startIdx = 0;
    const hourKey = Math.floor(startTime / (60 * 60 * 1000)) * (60 * 60 * 1000);
    
    if (this.timeIndex.has(hourKey)) {
      startIdx = this.timeIndex.get(hourKey)!;
    } else {
      const hours = Array.from(this.timeIndex.keys()).sort();
      for (const h of hours) {
        if (h < hourKey) {
          startIdx = this.timeIndex.get(h)!;
        } else {
          break;
        }
      }
    }

    const result: SensorData[] = [];
    for (let i = startIdx; i < this.sensorData.length; i++) {
      if (this.sensorData[i].timestamp > endTime) break;
      if (this.sensorData[i].timestamp >= startTime) {
        result.push(this.sensorData[i]);
      }
    }

    queryCache.set(cacheKey, result, 30000);
    return result;
  }

  getSensorDataByZone(zoneKey: string, startTime?: number, endTime?: number): SensorData[] {
    const indices = this.zoneIndex.get(zoneKey);
    if (!indices || indices.length === 0) return [];

    const result: SensorData[] = [];
    for (const idx of indices) {
      const d = this.sensorData[idx];
      if (startTime && d.timestamp < startTime) continue;
      if (endTime && d.timestamp > endTime) continue;
      result.push(d);
    }
    return result;
  }

  getLatestData(count: number = 20): SensorData[] {
    const cacheKey = `latest_${count}`;
    const cached = queryCache.get<SensorData[]>(cacheKey);
    if (cached) return cached;

    const result = this.sensorData.slice(-count);
    queryCache.set(cacheKey, result, 5000);
    return result;
  }

  setAnomalyClusters(clusters: AnomalyCluster[]): void {
    this.anomalyClusters = clusters;
  }

  getAnomalyClusters(): AnomalyCluster[] {
    return [...this.anomalyClusters];
  }

  getUniqueDevices(): string[] {
    return Array.from(this.deviceIndex.keys());
  }

  getDataByDevice(deviceId: string): SensorData[] {
    const indices = this.deviceIndex.get(deviceId);
    if (!indices) return [];
    return indices.map((idx) => this.sensorData[idx]);
  }

  getLatestDataByDevice(deviceId: string): SensorData | undefined {
    const indices = this.deviceIndex.get(deviceId);
    if (!indices || indices.length === 0) return undefined;
    return this.sensorData[indices[indices.length - 1]];
  }

  getAggregatedTimeseries(
    startTime: number,
    endTime: number,
    interval: number
  ): Array<{
    timestamp: number;
    temperature: number;
    humidity: number;
    co2: number;
    ch4: number;
    count: number;
  }> {
    const cacheKey = `agg_${startTime}_${endTime}_${interval}`;
    const cached = queryCache.get<any[]>(cacheKey);
    if (cached) return cached;

    const startIdx = this.findStartIndex(startTime);
    
    const buckets: Map<number, {
      tempSum: number;
      humSum: number;
      co2Sum: number;
      ch4Sum: number;
      count: number;
    }> = new Map();

    for (let i = startIdx; i < this.sensorData.length; i++) {
      const d = this.sensorData[i];
      if (d.timestamp > endTime) break;
      if (d.timestamp < startTime) continue;

      const bucketKey = Math.floor(d.timestamp / interval) * interval;

      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = { tempSum: 0, humSum: 0, co2Sum: 0, ch4Sum: 0, count: 0 };
        buckets.set(bucketKey, bucket);
      }

      bucket.tempSum += d.temperature;
      bucket.humSum += d.humidity;
      bucket.co2Sum += d.gasConcentration.co2;
      bucket.ch4Sum += d.gasConcentration.ch4;
      bucket.count++;
    }

    const result = Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([timestamp, bucket]) => ({
        timestamp,
        temperature: parseFloat((bucket.tempSum / bucket.count).toFixed(2)),
        humidity: parseFloat((bucket.humSum / bucket.count).toFixed(2)),
        co2: parseFloat((bucket.co2Sum / bucket.count).toFixed(2)),
        ch4: parseFloat((bucket.ch4Sum / bucket.count).toFixed(4)),
        count: bucket.count,
      }));

    queryCache.set(cacheKey, result, 30000);
    return result;
  }

  private findStartIndex(startTime: number): number {
    const hours = Array.from(this.timeIndex.keys()).sort((a, b) => a - b);
    let startIdx = 0;

    for (const h of hours) {
      if (h <= startTime) {
        startIdx = this.timeIndex.get(h)!;
      } else {
        break;
      }
    }

    return startIdx;
  }

  getZones(): string[] {
    return Array.from(this.zoneIndex.keys());
  }

  clear(): void {
    this.sensorData = [];
    this.anomalyClusters = [];
    this.timeIndex.clear();
    this.deviceIndex.clear();
    this.zoneIndex.clear();
    queryCache.clear();
  }

  getSize(): number {
    return this.sensorData.length;
  }
}

export const dataStore = new DataStore();
