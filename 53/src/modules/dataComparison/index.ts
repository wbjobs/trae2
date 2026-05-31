import _ from 'lodash-es';
import type { MonitorData, ComparisonData, TrendDataPoint } from '../../types';

export class DataComparator {
  compareSections(
    dataBySection: Record<string, MonitorData[]>,
    factorId: string
  ): ComparisonData[] {
    const results: ComparisonData[] = [];

    Object.entries(dataBySection).forEach(([sectionId, sectionData]) => {
      const filteredData = sectionData.filter((d) => d.factorId === factorId);
      if (filteredData.length === 0) return;

      const values = filteredData.map((d) => d.value);
      const avgValue = _.mean(values);
      const maxValue = Math.max(...values);
      const minValue = Math.min(...values);
      const stdDev = Math.sqrt(_.mean(values.map((v) => Math.pow(v - avgValue, 2))));

      const exceedCount = filteredData.filter(
        (d) => d.value > (d.standardValue || 0)
      ).length;
      const exceedRate = (exceedCount / filteredData.length) * 100;

      const trend = this.calculateTrend(filteredData);

      const dataPoints: TrendDataPoint[] = filteredData.map((d) => ({
        timestamp: d.timestamp,
        value: d.value,
        sectionId: d.sectionId,
        factorId: d.factorId,
      }));

      results.push({
        sectionId,
        sectionName: filteredData[0].sectionName,
        factorId,
        factorName: filteredData[0].factorName,
        avgValue,
        maxValue,
        minValue,
        stdDev,
        exceedRate,
        trend,
        dataPoints,
      });
    });

    return _.sortBy(results, (r) => -r.avgValue);
  }

  compareFactors(
    data: MonitorData[],
    sectionId: string
  ): ComparisonData[] {
    const filteredData = data.filter((d) => d.sectionId === sectionId);
    const dataByFactor = _.groupBy(filteredData, 'factorId');

    const results: ComparisonData[] = [];

    Object.entries(dataByFactor).forEach(([factorId, factorData]) => {
      if (factorData.length === 0) return;

      const values = factorData.map((d) => d.value);
      const avgValue = _.mean(values);
      const maxValue = Math.max(...values);
      const minValue = Math.min(...values);
      const stdDev = Math.sqrt(_.mean(values.map((v) => Math.pow(v - avgValue, 2))));

      const exceedCount = factorData.filter(
        (d) => d.value > (d.standardValue || 0)
      ).length;
      const exceedRate = (exceedCount / factorData.length) * 100;

      const trend = this.calculateTrend(factorData);

      const dataPoints: TrendDataPoint[] = factorData.map((d) => ({
        timestamp: d.timestamp,
        value: d.value,
        sectionId: d.sectionId,
        factorId: d.factorId,
      }));

      results.push({
        sectionId,
        sectionName: factorData[0].sectionName,
        factorId,
        factorName: factorData[0].factorName,
        avgValue,
        maxValue,
        minValue,
        stdDev,
        exceedRate,
        trend,
        dataPoints,
      });
    });

    return _.sortBy(results, (r) => -r.exceedRate);
  }

  calculateTrend(data: MonitorData[]): number {
    if (data.length < 2) return 0;

    const sorted = _.sortBy(data, (d) => new Date(d.timestamp).getTime());
    const n = sorted.length;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += sorted[i].value;
      sumXY += i * sorted[i].value;
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;

    return avgY > 0 ? (slope / avgY) * 100 : 0;
  }

  generateComparisonReport(comparisonData: ComparisonData[]) {
    const best = _.minBy(comparisonData, (d) => d.exceedRate);
    const worst = _.maxBy(comparisonData, (d) => d.exceedRate);

    const avgExceedRate = _.mean(comparisonData.map((d) => d.exceedRate));
    const improvingCount = comparisonData.filter((d) => d.trend < 0).length;
    const worseningCount = comparisonData.filter((d) => d.trend > 0).length;

    return {
      totalSections: comparisonData.length,
      avgExceedRate,
      bestSection: best,
      worstSection: worst,
      improvingCount,
      worseningCount,
      stableCount: comparisonData.length - improvingCount - worseningCount,
    };
  }

  normalizeForComparison(values: number[]): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return values.map(() => 0.5);
    return values.map((v) => (v - min) / (max - min));
  }

  calculateSimilarity(data1: MonitorData[], data2: MonitorData[]): number {
    if (data1.length === 0 || data2.length === 0) return 0;

    const values1 = data1.map((d) => d.value);
    const values2 = data2.map((d) => d.value);

    const norm1 = this.normalizeForComparison(values1);
    const norm2 = this.normalizeForComparison(values2);

    const minLength = Math.min(norm1.length, norm2.length);
    let distance = 0;

    for (let i = 0; i < minLength; i++) {
      distance += Math.pow(norm1[i] - norm2[i], 2);
    }

    const euclideanDistance = Math.sqrt(distance);
    return 1 / (1 + euclideanDistance);
  }

  calculateCorrelation(data1: MonitorData[], data2: MonitorData[]): number {
    if (data1.length < 2 || data2.length < 2) return 0;

    const values1 = data1.map((d) => d.value);
    const values2 = data2.map((d) => d.value);

    const minLength = Math.min(values1.length, values2.length);
    const v1 = values1.slice(0, minLength);
    const v2 = values2.slice(0, minLength);

    const mean1 = _.mean(v1);
    const mean2 = _.mean(v2);

    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;

    for (let i = 0; i < minLength; i++) {
      const diff1 = v1[i] - mean1;
      const diff2 = v2[i] - mean2;
      numerator += diff1 * diff2;
      denom1 += diff1 * diff1;
      denom2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(denom1 * denom2);
    return denominator === 0 ? 0 : numerator / denominator;
  }
}

export const dataComparator = new DataComparator();
