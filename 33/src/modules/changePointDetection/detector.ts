import { SoundingDataPoint } from '@/types';
import { ChangePoint, DetectionConfig, FieldChangePoints } from './types';

const FIELD_CONFIG: Record<string, { name: string; unit: string; threshold: number }> = {
  temperature: { name: '温度', unit: '°C', threshold: 2 },
  dewPoint: { name: '露点', unit: '°C', threshold: 3 },
  relativeHumidity: { name: '相对湿度', unit: '%', threshold: 15 },
  windSpeed: { name: '风速', unit: 'm/s', threshold: 5 },
  windDirection: { name: '风向', unit: '°', threshold: 60 },
  uWind: { name: 'U风', unit: 'm/s', threshold: 8 },
  vWind: { name: 'V风', unit: 'm/s', threshold: 8 }
};

const DEFAULT_CONFIG: DetectionConfig = {
  threshold: 1.5,
  windowSize: 3,
  minSignificance: 'medium',
  fields: ['temperature', 'dewPoint', 'relativeHumidity', 'windSpeed']
};

export class ChangePointDetector {
  private config: DetectionConfig;

  constructor(config?: Partial<DetectionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public detect(points: SoundingDataPoint[]): FieldChangePoints[] {
    if (points.length < 3) return [];

    const results: FieldChangePoints[] = [];
    const fieldsToCheck = this.config.fields.filter(f => FIELD_CONFIG[f]);

    for (const field of fieldsToCheck) {
      const fieldConfig = FIELD_CONFIG[field];
      const changePoints = this.detectFieldChanges(points, field as keyof SoundingDataPoint, fieldConfig);
      if (changePoints.length > 0) {
        results.push({
          field,
          fieldName: fieldConfig.name,
          unit: fieldConfig.unit,
          points: changePoints
        });
      }
    }

    return results;
  }

  private detectFieldChanges(
    points: SoundingDataPoint[],
    field: keyof SoundingDataPoint,
    fieldConfig: { threshold: number }
  ): ChangePoint[] {
    const changePoints: ChangePoint[] = [];
    const values = points.map(p => p[field] as number);

    for (let i = this.config.windowSize; i < points.length - this.config.windowSize; i++) {
      const leftWindow = values.slice(i - this.config.windowSize, i);
      const rightWindow = values.slice(i + 1, i + 1 + this.config.windowSize);

      const leftMean = this.mean(leftWindow);
      const rightMean = this.mean(rightWindow);
      const absoluteChange = Math.abs(rightMean - leftMean);
      const changeRate = this.calculateChangeRate(leftWindow, rightWindow);

      const significance = this.getSignificance(absoluteChange, fieldConfig.threshold);

      if (
        significance !== 'low' &&
        absoluteChange >= fieldConfig.threshold * this.config.threshold &&
        this.isSignificantChange(values, i, absoluteChange)
      ) {
        changePoints.push({
          index: i,
          height: points[i].height,
          pressure: points[i].pressure,
          field: field as string,
          value: values[i],
          previousValue: values[i - 1],
          changeRate,
          absoluteChange,
          significance,
          description: this.generateDescription(field as string, significance, absoluteChange, fieldConfig.unit)
        });
      }
    }

    return changePoints;
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private std(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = this.mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(this.mean(squaredDiffs));
  }

  private calculateChangeRate(left: number[], right: number[]): number {
    const leftMean = this.mean(left);
    const rightMean = this.mean(right);
    if (Math.abs(leftMean) < 0.001) return 100;
    return Math.abs((rightMean - leftMean) / leftMean) * 100;
  }

  private getSignificance(absoluteChange: number, threshold: number): 'low' | 'medium' | 'high' {
    const ratio = absoluteChange / threshold;
    if (ratio >= 3) return 'high';
    if (ratio >= 1.5) return 'medium';
    return 'low';
  }

  private isSignificantChange(values: number[], index: number, change: number): boolean {
    const localStd = this.std(values.slice(Math.max(0, index - 5), Math.min(values.length, index + 6)));
    return change > localStd * 2;
  }

  private generateDescription(field: string, significance: string, change: number, unit: string): string {
    const fieldName = FIELD_CONFIG[field]?.name || field;
    const sigText = significance === 'high' ? '显著' : significance === 'medium' ? '中等' : '轻微';
    return `${sigText}突变：${fieldName}变化${change.toFixed(1)}${unit}`;
  }

  public getAllChangePoints(points: SoundingDataPoint[]): ChangePoint[] {
    const fieldResults = this.detect(points);
    return fieldResults.flatMap(r => r.points);
  }

  public getHighSignificancePoints(points: SoundingDataPoint[]): ChangePoint[] {
    return this.getAllChangePoints(points).filter(p => p.significance === 'high');
  }

  public summarizeChanges(points: SoundingDataPoint[]): {
    total: number;
    byField: Record<string, number>;
    bySignificance: Record<string, number>;
    heights: number[];
  } {
    const allPoints = this.getAllChangePoints(points);
    const byField: Record<string, number> = {};
    const bySignificance: Record<string, number> = { low: 0, medium: 0, high: 0 };

    allPoints.forEach(p => {
      byField[p.field] = (byField[p.field] || 0) + 1;
      bySignificance[p.significance]++;
    });

    return {
      total: allPoints.length,
      byField,
      bySignificance,
      heights: allPoints.map(p => p.height).sort((a, b) => a - b)
    };
  }
}

export const changePointDetector = new ChangePointDetector();
