import { SoundingDataPoint, DataQualityReport } from '@/types';
import { fieldValidationRules } from './validationRules';
import { CleanedSoundingData } from './types';

export class DataCleaner {
  public clean(points: SoundingDataPoint[]): CleanedSoundingData {
    const qualityReport = this.generateQualityReport(points);
    const cleanedPoints = this.removeInvalidPoints(points);
    const filledPoints = this.fillMissingFields(cleanedPoints);
    const smoothedPoints = this.smoothData(filledPoints);

    return {
      originalPoints: points,
      cleanedPoints: smoothedPoints,
      qualityReport
    };
  }

  private generateQualityReport(points: SoundingDataPoint[]): DataQualityReport {
    const missingFields: Record<string, number> = {};
    const outliers: Record<string, number[]> = {};
    let invalidPoints = 0;

    fieldValidationRules.forEach(rule => {
      missingFields[rule.field] = 0;
      outliers[rule.field] = [];
    });

    points.forEach((point, index) => {
      let isInvalid = false;

      fieldValidationRules.forEach(rule => {
        const value = point[rule.field];

        if (value === undefined || value === null || isNaN(value)) {
          if (rule.required) {
            isInvalid = true;
          }
          missingFields[rule.field]++;
        } else if (value < rule.min || value > rule.max) {
          outliers[rule.field].push(index);
          isInvalid = true;
        }
      });

      if (isInvalid) {
        invalidPoints++;
      }
    });

    const qualityScore = this.calculateQualityScore(points.length, invalidPoints, missingFields);

    return {
      totalPoints: points.length,
      validPoints: points.length - invalidPoints,
      invalidPoints,
      missingFields,
      outliers,
      qualityScore
    };
  }

  private calculateQualityScore(
    totalPoints: number,
    invalidPoints: number,
    missingFields: Record<string, number>
  ): number {
    if (totalPoints === 0) return 0;

    const validityScore = ((totalPoints - invalidPoints) / totalPoints) * 40;
    const completenessScore = this.calculateCompletenessScore(missingFields, totalPoints) * 60;

    return Math.round(validityScore + completenessScore);
  }

  private calculateCompletenessScore(
    missingFields: Record<string, number>,
    totalPoints: number
  ): number {
    const requiredFields = fieldValidationRules.filter(r => r.required);
    let totalMissing = 0;

    requiredFields.forEach(rule => {
      totalMissing += missingFields[rule.field] || 0;
    });

    const totalPossible = requiredFields.length * totalPoints;
    return totalPossible > 0 ? 1 - (totalMissing / totalPossible) : 1;
  }

  private removeInvalidPoints(points: SoundingDataPoint[]): SoundingDataPoint[] {
    return points.filter(point => {
      return fieldValidationRules.every(rule => {
        if (!rule.required) return true;
        const value = point[rule.field];
        return value !== undefined && value !== null && !isNaN(value) &&
               value >= rule.min && value <= rule.max;
      });
    });
  }

  private fillMissingFields(points: SoundingDataPoint[]): SoundingDataPoint[] {
    return points.map(point => {
      const filledPoint = { ...point };

      if (filledPoint.uWind === undefined || isNaN(filledPoint.uWind)) {
        filledPoint.uWind = this.calculateUWind(filledPoint.windSpeed, filledPoint.windDirection);
      }

      if (filledPoint.vWind === undefined || isNaN(filledPoint.vWind)) {
        filledPoint.vWind = this.calculateVWind(filledPoint.windSpeed, filledPoint.windDirection);
      }

      if (filledPoint.relativeHumidity === undefined || isNaN(filledPoint.relativeHumidity)) {
        filledPoint.relativeHumidity = this.calculateRH(filledPoint.temperature, filledPoint.dewPoint);
      }

      if (filledPoint.dewPoint === undefined || isNaN(filledPoint.dewPoint)) {
        filledPoint.dewPoint = this.calculateDewPoint(filledPoint.temperature, filledPoint.relativeHumidity);
      }

      return filledPoint;
    });
  }

  private calculateUWind(windSpeed: number, windDirection: number): number {
    return -windSpeed * Math.sin(windDirection * Math.PI / 180);
  }

  private calculateVWind(windSpeed: number, windDirection: number): number {
    return -windSpeed * Math.cos(windDirection * Math.PI / 180);
  }

  private calculateRH(temperature: number, dewPoint: number): number {
    const es = 6.112 * Math.exp(17.67 * temperature / (temperature + 243.5));
    const e = 6.112 * Math.exp(17.67 * dewPoint / (dewPoint + 243.5));
    return Math.round((e / es) * 100 * 10) / 10;
  }

  private calculateDewPoint(temperature: number, rh: number): number {
    const es = 6.112 * Math.exp(17.67 * temperature / (temperature + 243.5));
    const e = es * (rh / 100);
    return Math.round((243.5 * Math.log(e / 6.112)) / (17.67 - Math.log(e / 6.112)) * 10) / 10;
  }

  private smoothData(points: SoundingDataPoint[], windowSize: number = 3): SoundingDataPoint[] {
    if (points.length < windowSize) return points;

    const smoothed: SoundingDataPoint[] = [];

    for (let i = 0; i < points.length; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(points.length, i + Math.ceil(windowSize / 2));
      const window = points.slice(start, end);

      smoothed.push({
        ...points[i],
        temperature: this.average(window.map(p => p.temperature)),
        dewPoint: this.average(window.map(p => p.dewPoint)),
        windSpeed: this.average(window.map(p => p.windSpeed))
      });
    }

    return smoothed;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10;
  }
}

export const dataCleaner = new DataCleaner();
