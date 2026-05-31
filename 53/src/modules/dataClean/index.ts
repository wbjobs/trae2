import _ from 'lodash-es';
import type { MonitorData, FusedData, WaterQuality } from '../../types';

export class DataCleaner {
  detectOutliers(data: number[], k: number = 3): boolean[] {
    if (data.length === 0) return [];

    const mean = _.mean(data);
    const std = Math.sqrt(_.mean(data.map(x => Math.pow(x - mean, 2))));

    return data.map(value => {
      const zScore = std === 0 ? 0 : Math.abs((value - mean) / std);
      return zScore > k;
    });
  }

  detectOutliersIQR(data: number[]): boolean[] {
    if (data.length === 0) return [];

    const sorted = [...data].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return data.map(value => value < lowerBound || value > upperBound);
  }

  fillMissingValues(
    data: (number | null)[],
    method: 'linear' | 'mean' | 'nearest' = 'linear'
  ): number[] {
    const result: number[] = [];
    const validIndices = data
      .map((v, i) => (v !== null ? i : -1))
      .filter(i => i >= 0);

    if (validIndices.length === 0) {
      return data.map(() => 0);
    }

    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      if (value !== null) {
        result.push(value);
        continue;
      }

      switch (method) {
        case 'mean': {
          const validValues = validIndices.map(idx => data[idx] as number);
          result.push(_.mean(validValues));
          break;
        }
        case 'nearest': {
          const nearestIdx = validIndices.reduce((nearest, idx) =>
            Math.abs(idx - i) < Math.abs(nearest - i) ? idx : nearest
          );
          result.push(data[nearestIdx] as number);
          break;
        }
        case 'linear':
        default: {
          let leftIdx = validIndices.findLast(idx => idx < i);
          let rightIdx = validIndices.find(idx => idx > i);

          if (leftIdx === undefined) leftIdx = validIndices[0];
          if (rightIdx === undefined) rightIdx = validIndices[validIndices.length - 1];

          if (leftIdx === rightIdx) {
            result.push(data[leftIdx] as number);
          } else {
            const leftValue = data[leftIdx] as number;
            const rightValue = data[rightIdx] as number;
            const ratio = (i - leftIdx) / (rightIdx - leftIdx);
            result.push(leftValue + (rightValue - leftValue) * ratio);
          }
          break;
        }
      }
    }

    return result;
  }

  normalize(data: number[]): number[] {
    if (data.length === 0) return [];

    const min = Math.min(...data);
    const max = Math.max(...data);

    if (max === min) {
      return data.map(() => 0.5);
    }

    return data.map(value => (value - min) / (max - min));
  }

  standardize(data: number[]): number[] {
    if (data.length === 0) return [];

    const mean = _.mean(data);
    const std = Math.sqrt(_.mean(data.map(x => Math.pow(x - mean, 2))));

    if (std === 0) {
      return data.map(() => 0);
    }

    return data.map(value => (value - mean) / std);
  }

  smoothData(data: number[], windowSize: number = 3): number[] {
    if (data.length === 0 || windowSize <= 0) return data;

    const halfWindow = Math.floor(windowSize / 2);
    return data.map((_, i) => {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(data.length, i + halfWindow + 1);
      const window = data.slice(start, end);
      return _.mean(window);
    });
  }

  removeOutliersAndFill(
    data: (number | null)[],
    method: 'zscore' | 'iqr' = 'zscore',
    fillMethod: 'linear' | 'mean' | 'nearest' = 'linear'
  ): number[] {
    const validIndices: number[] = [];
    const validValues: number[] = [];
    data.forEach((v, i) => {
      if (v !== null) {
        validIndices.push(i);
        validValues.push(v);
      }
    });

    if (validValues.length === 0) {
      return this.fillMissingValues(data, fillMethod);
    }

    const outlierFlags = method === 'zscore'
      ? this.detectOutliers(validValues)
      : this.detectOutliersIQR(validValues);

    const outlierSet = new Set<number>();
    outlierFlags.forEach((isOutlier, idx) => {
      if (isOutlier) {
        outlierSet.add(validIndices[idx]);
      }
    });

    const dataWithOutliersRemoved = data.map((value, idx) => {
      if (value === null) return null;
      return outlierSet.has(idx) ? null : value;
    });

    return this.fillMissingValues(dataWithOutliersRemoved, fillMethod);
  }

  fuseMultiFactor(dataBySection: MonitorData[][]): FusedData[] {
    const fusedData: FusedData[] = [];

    if (!Array.isArray(dataBySection)) {
      console.warn('fuseMultiFactor: dataBySection must be an array of arrays');
      return fusedData;
    }

    dataBySection.forEach((sectionData, sectionIndex) => {
      if (!Array.isArray(sectionData) || sectionData.length === 0) return;

      const firstRecord = sectionData[0];
      if (!firstRecord || !firstRecord.sectionId) {
        console.warn(`fuseMultiFactor: invalid data at section index ${sectionIndex}`);
        return;
      }

      const cleanedSectionData = sectionData.filter(record => {
        const validation = this.validateData(record);
        return validation.isValid;
      });

      if (cleanedSectionData.length === 0) return;

      const groupedByTime = _.groupBy(cleanedSectionData, d => {
        const date = new Date(d.timestamp);
        if (isNaN(date.getTime())) {
          return '';
        }
        date.setMinutes(0, 0, 0);
        return date.toISOString();
      });

      Object.entries(groupedByTime).forEach(([timestamp, records]) => {
        if (!timestamp || records.length === 0) return;

        const factors: Record<string, number> = {};
        const factorCount: Record<string, number[]> = {};

        records.forEach(record => {
          if (!factorCount[record.factorId]) {
            factorCount[record.factorId] = [];
          }
          factorCount[record.factorId].push(record.value);
        });

        Object.entries(factorCount).forEach(([factorId, values]) => {
          if (values.length === 1) {
            factors[factorId] = values[0];
          } else {
            factors[factorId] = _.mean(values);
          }
        });

        const qualityValues: WaterQuality[] = records.map(r => r.quality);
        const qualityCount = {
          excellent: qualityValues.filter(q => q === 'excellent').length,
          good: qualityValues.filter(q => q === 'good').length,
          moderate: qualityValues.filter(q => q === 'moderate').length,
          poor: qualityValues.filter(q => q === 'poor').length,
        };

        let overallQuality: WaterQuality = 'good';
        if (qualityCount.poor > 0) {
          overallQuality = 'poor';
        } else if (qualityCount.moderate > qualityCount.excellent + qualityCount.good) {
          overallQuality = 'moderate';
        } else if (qualityCount.excellent >= qualityCount.good) {
          overallQuality = 'excellent';
        }

        const overallScore = this.calculateOverallScore(factors);

        fusedData.push({
          id: `${firstRecord.sectionId}_${timestamp}`,
          sectionId: firstRecord.sectionId,
          sectionName: firstRecord.sectionName,
          timestamp,
          factors,
          quality: overallQuality,
          overallScore,
        });
      });
    });

    return _.sortBy(fusedData, d => new Date(d.timestamp).getTime());
  }

  private calculateOverallScore(factors: Record<string, number>): number {
    const weights: Record<string, number> = {
      do: 0.15,
      ph: 0.10,
      cod: 0.15,
      nh3n: 0.15,
      tp: 0.12,
      tn: 0.12,
      algae: 0.10,
      chla: 0.11,
    };

    let totalWeight = 0;
    let weightedSum = 0;

    Object.entries(factors).forEach(([factorId, value]) => {
      const weight = weights[factorId] || 0.1;
      let score = 70;

      switch (factorId) {
        case 'do':
          score = value >= 7.5 ? 95 : value >= 6 ? 80 : value >= 5 ? 60 : 40;
          break;
        case 'ph':
          score = (value >= 6.5 && value <= 8.5) ? 95 : (value >= 6 && value <= 9) ? 80 : 50;
          break;
        case 'cod':
          score = value <= 15 ? 95 : value <= 20 ? 80 : value <= 30 ? 60 : 40;
          break;
        case 'nh3n':
          score = value <= 0.15 ? 95 : value <= 0.5 ? 80 : value <= 1.0 ? 60 : 40;
          break;
        case 'tp':
          score = value <= 0.02 ? 95 : value <= 0.1 ? 80 : value <= 0.2 ? 60 : 40;
          break;
        case 'tn':
          score = value <= 0.2 ? 95 : value <= 0.5 ? 80 : value <= 1.5 ? 60 : 40;
          break;
        case 'algae':
          score = value <= 100000 ? 95 : value <= 300000 ? 80 : value <= 1000000 ? 60 : 40;
          break;
        case 'chla':
          score = value <= 2 ? 95 : value <= 5 ? 80 : value <= 10 ? 60 : 40;
          break;
      }

      weightedSum += score * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  validateData(data: MonitorData): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (data.value < 0) {
      issues.push('数值不能为负数');
    }

    if (data.factorId === 'ph' && (data.value < 0 || data.value > 14)) {
      issues.push('PH值应在0-14范围内');
    }

    if (data.factorId === 'do' && data.value > 20) {
      issues.push('溶解氧数值异常偏高');
    }

    if (!data.timestamp || isNaN(new Date(data.timestamp).getTime())) {
      issues.push('时间戳格式无效');
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }
}

export const dataCleaner = new DataCleaner();
