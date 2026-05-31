import { SoundingDataPoint } from '@/types';
import { FusionConfig } from './types';
import { STANDARD_PRESSURE_LEVELS } from './validationRules';

export class DataFusion {
  private config: FusionConfig = {
    interpolationMethod: 'linear',
    pressureLevels: STANDARD_PRESSURE_LEVELS,
    outlierThreshold: 3,
    maxGapSize: 5
  };

  public setConfig(config: Partial<FusionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public fuseToStandardLevels(points: SoundingDataPoint[]): SoundingDataPoint[] {
    if (points.length < 2) return points;

    const sortedPoints = this.sortByPressure(points);
    const fusedPoints: SoundingDataPoint[] = [];

    for (const pressure of this.config.pressureLevels) {
      const interpolatedPoint = this.interpolateToPressure(sortedPoints, pressure);
      if (interpolatedPoint) {
        fusedPoints.push(interpolatedPoint);
      }
    }

    return fusedPoints;
  }

  public fuseMultipleDatasets(datasets: SoundingDataPoint[][]): SoundingDataPoint[] {
    if (datasets.length === 0) return [];
    if (datasets.length === 1) return datasets[0];

    const allPressureLevels = this.extractUniquePressures(datasets);
    const fusedPoints: SoundingDataPoint[] = [];

    for (const pressure of allPressureLevels) {
      const valuesAtLevel = datasets.map(ds =>
        this.findNearestPoint(ds, pressure)
      ).filter(Boolean) as SoundingDataPoint[];

      if (valuesAtLevel.length > 0) {
        fusedPoints.push(this.averagePoints(valuesAtLevel, pressure));
      }
    }

    return this.sortByPressure(fusedPoints);
  }

  private sortByPressure(points: SoundingDataPoint[]): SoundingDataPoint[] {
    return [...points].sort((a, b) => b.pressure - a.pressure);
  }

  private interpolateToPressure(
    sortedPoints: SoundingDataPoint[],
    targetPressure: number
  ): SoundingDataPoint | null {
    const pressures = sortedPoints.map(p => p.pressure);

    if (targetPressure > pressures[0] || targetPressure < pressures[pressures.length - 1]) {
      return null;
    }

    let upperIdx = 0;
    for (let i = 0; i < pressures.length - 1; i++) {
      if (pressures[i] >= targetPressure && pressures[i + 1] <= targetPressure) {
        upperIdx = i;
        break;
      }
    }

    const p1 = sortedPoints[upperIdx];
    const p2 = sortedPoints[upperIdx + 1];

    if (!p1 || !p2) return null;

    const ratio = (targetPressure - p1.pressure) / (p2.pressure - p1.pressure);

    return {
      pressure: targetPressure,
      height: this.interpolate(p1.height, p2.height, ratio),
      temperature: this.interpolate(p1.temperature, p2.temperature, ratio),
      dewPoint: this.interpolate(p1.dewPoint, p2.dewPoint, ratio),
      relativeHumidity: Math.round(this.interpolate(p1.relativeHumidity, p2.relativeHumidity, ratio) * 10) / 10,
      windSpeed: Math.round(this.interpolate(p1.windSpeed, p2.windSpeed, ratio) * 10) / 10,
      windDirection: this.interpolateWindDirection(p1.windDirection, p2.windDirection, ratio),
      uWind: Math.round(this.interpolate(p1.uWind, p2.uWind, ratio) * 10) / 10,
      vWind: Math.round(this.interpolate(p1.vWind, p2.vWind, ratio) * 10) / 10
    };
  }

  private interpolate(lower: number, upper: number, ratio: number): number {
    return lower + (upper - lower) * ratio;
  }

  private interpolateWindDirection(dir1: number, dir2: number, ratio: number): number {
    const diff = dir2 - dir1;
    if (Math.abs(diff) > 180) {
      if (diff > 0) {
        return Math.round(dir1 + (diff - 360) * ratio + 360) % 360;
      } else {
        return Math.round(dir1 + (diff + 360) * ratio) % 360;
      }
    }
    return Math.round(dir1 + diff * ratio);
  }

  private extractUniquePressures(datasets: SoundingDataPoint[][]): number[] {
    const pressureSet = new Set<number>();
    datasets.forEach(ds => {
      ds.forEach(p => pressureSet.add(p.pressure));
    });
    return Array.from(pressureSet).sort((a, b) => b - a);
  }

  private findNearestPoint(
    points: SoundingDataPoint[],
    targetPressure: number
  ): SoundingDataPoint | null {
    if (points.length === 0) return null;

    let nearest = points[0];
    let minDiff = Math.abs(points[0].pressure - targetPressure);

    for (const point of points) {
      const diff = Math.abs(point.pressure - targetPressure);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = point;
      }
    }

    return minDiff <= 50 ? nearest : null;
  }

  private averagePoints(points: SoundingDataPoint[], pressure: number): SoundingDataPoint {
    const count = points.length;
    return {
      pressure,
      height: Math.round(points.reduce((sum, p) => sum + p.height, 0) / count),
      temperature: Math.round(points.reduce((sum, p) => sum + p.temperature, 0) / count * 10) / 10,
      dewPoint: Math.round(points.reduce((sum, p) => sum + p.dewPoint, 0) / count * 10) / 10,
      relativeHumidity: Math.round(points.reduce((sum, p) => sum + p.relativeHumidity, 0) / count * 10) / 10,
      windSpeed: Math.round(points.reduce((sum, p) => sum + p.windSpeed, 0) / count * 10) / 10,
      windDirection: Math.round(this.averageWindDirection(points.map(p => p.windDirection))),
      uWind: Math.round(points.reduce((sum, p) => sum + p.uWind, 0) / count * 10) / 10,
      vWind: Math.round(points.reduce((sum, p) => sum + p.vWind, 0) / count * 10) / 10
    };
  }

  private averageWindDirection(directions: number[]): number {
    let sumSin = 0;
    let sumCos = 0;

    directions.forEach(dir => {
      sumSin += Math.sin(dir * Math.PI / 180);
      sumCos += Math.cos(dir * Math.PI / 180);
    });

    const avgSin = sumSin / directions.length;
    const avgCos = sumCos / directions.length;

    return Math.atan2(avgSin, avgCos) * 180 / Math.PI;
  }
}

export const dataFusion = new DataFusion();
