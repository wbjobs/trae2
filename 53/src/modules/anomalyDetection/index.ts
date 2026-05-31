import _ from 'lodash-es';
import type { MonitorData, AnomalyRange, AnomalyDetectionParams } from '../../types';
import { dataCleaner } from '../dataClean';

export class AnomalyDetector {
  detectExceedStandard(data: MonitorData[], standardValue: number): AnomalyRange[] {
    if (data.length === 0) return [];

    const anomalies: AnomalyRange[] = [];
    let currentAnomaly: MonitorData[] = [];

    const sortedData = _.sortBy(data, (d) => new Date(d.timestamp).getTime());

    sortedData.forEach((record, index) => {
      const isExceed = record.value > standardValue;

      if (isExceed) {
        currentAnomaly.push(record);
      }

      if ((!isExceed || index === sortedData.length - 1) && currentAnomaly.length > 0) {
        if (currentAnomaly.length >= 3) {
          const values = currentAnomaly.map((d) => d.value);
          anomalies.push({
            id: `std_${currentAnomaly[0].id}_${currentAnomaly[currentAnomaly.length - 1].id}`,
            factorId: currentAnomaly[0].factorId,
            factorName: currentAnomaly[0].factorName,
            sectionId: currentAnomaly[0].sectionId,
            sectionName: currentAnomaly[0].sectionName,
            startTime: currentAnomaly[0].timestamp,
            endTime: currentAnomaly[currentAnomaly.length - 1].timestamp,
            minValue: Math.min(...values),
            maxValue: Math.max(...values),
            type: 'exceed_standard',
            severity: this.calculateSeverity(values, standardValue),
            description: `${currentAnomaly.length}个连续监测数据超出标准值${standardValue}`,
            status: 'active',
          });
        }
        currentAnomaly = [];
      }
    });

    return anomalies;
  }

  detectSuddenChange(data: MonitorData[], threshold: number = 50): AnomalyRange[] {
    if (data.length < 3) return [];

    const anomalies: AnomalyRange[] = [];
    const sortedData = _.sortBy(data, (d) => new Date(d.timestamp).getTime());

    for (let i = 2; i < sortedData.length; i++) {
      const prev = sortedData[i - 1].value;
      const curr = sortedData[i].value;
      const changeRate = Math.abs((curr - prev) / prev) * 100;

      if (changeRate > threshold && prev > 0) {
        anomalies.push({
          id: `sudden_${sortedData[i].id}`,
          factorId: sortedData[i].factorId,
          factorName: sortedData[i].factorName,
          sectionId: sortedData[i].sectionId,
          sectionName: sortedData[i].sectionName,
          startTime: sortedData[i - 1].timestamp,
          endTime: sortedData[i].timestamp,
          minValue: Math.min(prev, curr),
          maxValue: Math.max(prev, curr),
          type: 'sudden_change',
          severity: changeRate > 100 ? 'high' : changeRate > 75 ? 'medium' : 'low',
          description: `数据突变，变化率${changeRate.toFixed(1)}%`,
          status: 'active',
        });
      }
    }

    return anomalies;
  }

  detectMissingData(
    data: MonitorData[],
    expectedIntervalHours: number = 4,
    maxMissingCount: number = 3
  ): AnomalyRange[] {
    if (data.length < 2) return [];

    const anomalies: AnomalyRange[] = [];
    const sortedData = _.sortBy(data, (d) => new Date(d.timestamp).getTime());

    for (let i = 1; i < sortedData.length; i++) {
      const prevTime = new Date(sortedData[i - 1].timestamp).getTime();
      const currTime = new Date(sortedData[i].timestamp).getTime();
      const gapHours = (currTime - prevTime) / (1000 * 60 * 60);
      const missingCount = Math.floor(gapHours / expectedIntervalHours) - 1;

      if (missingCount >= maxMissingCount) {
        anomalies.push({
          id: `missing_${sortedData[i - 1].id}_${sortedData[i].id}`,
          factorId: sortedData[i].factorId,
          factorName: sortedData[i].factorName,
          sectionId: sortedData[i].sectionId,
          sectionName: sortedData[i].sectionName,
          startTime: sortedData[i - 1].timestamp,
          endTime: sortedData[i].timestamp,
          minValue: 0,
          maxValue: 0,
          type: 'missing_data',
          severity: missingCount > 6 ? 'high' : missingCount > 3 ? 'medium' : 'low',
          description: `数据缺失${missingCount}个监测点`,
          status: 'active',
        });
      }
    }

    return anomalies;
  }

  detectAbnormalTrend(data: MonitorData[], windowSize: number = 7): AnomalyRange[] {
    if (data.length < windowSize * 2) return [];

    const anomalies: AnomalyRange[] = [];
    const sortedData = _.sortBy(data, (d) => new Date(d.timestamp).getTime());
    const values = sortedData.map((d) => d.value);

    for (let i = windowSize; i < values.length; i++) {
      const window = values.slice(i - windowSize, i);
      const avgWindow = _.mean(window);
      const stdWindow = Math.sqrt(_.mean(window.map((v) => Math.pow(v - avgWindow, 2))));
      const current = values[i];

      if (stdWindow > 0 && Math.abs(current - avgWindow) > 3 * stdWindow) {
        anomalies.push({
          id: `trend_${sortedData[i].id}`,
          factorId: sortedData[i].factorId,
          factorName: sortedData[i].factorName,
          sectionId: sortedData[i].sectionId,
          sectionName: sortedData[i].sectionName,
          startTime: sortedData[i - windowSize].timestamp,
          endTime: sortedData[i].timestamp,
          minValue: Math.min(...window, current),
          maxValue: Math.max(...window, current),
          type: 'abnormal_trend',
          severity: 'medium',
          description: `趋势异常，当前值偏离窗口均值${(Math.abs(current - avgWindow) / stdWindow).toFixed(1)}倍标准差`,
          status: 'active',
        });
      }
    }

    return anomalies;
  }

  detectAllAnomalies(
    data: MonitorData[],
    params: AnomalyDetectionParams = {}
  ): AnomalyRange[] {
    const { threshold = 50, windowSize = 7 } = params;

    const exceedAnomalies = this.detectExceedStandard(data, data[0]?.standardValue || 0);
    const suddenAnomalies = this.detectSuddenChange(data, threshold);
    const missingAnomalies = this.detectMissingData(data);
    const trendAnomalies = this.detectAbnormalTrend(data, windowSize);

    return [...exceedAnomalies, ...suddenAnomalies, ...missingAnomalies, ...trendAnomalies];
  }

  private calculateSeverity(values: number[], standardValue: number): 'low' | 'medium' | 'high' {
    const maxExceedRate = (Math.max(...values) - standardValue) / standardValue;
    if (maxExceedRate > 1) return 'high';
    if (maxExceedRate > 0.5) return 'medium';
    return 'low';
  }

  groupAnomaliesByType(anomalies: AnomalyRange[]): Record<string, AnomalyRange[]> {
    return _.groupBy(anomalies, 'type');
  }

  getAnomalySummary(anomalies: AnomalyRange[]) {
    const grouped = this.groupAnomaliesByType(anomalies);
    const severityCounts = _.countBy(anomalies, 'severity');

    return {
      total: anomalies.length,
      byType: {
        exceed_standard: grouped['exceed_standard']?.length || 0,
        sudden_change: grouped['sudden_change']?.length || 0,
        missing_data: grouped['missing_data']?.length || 0,
        abnormal_trend: grouped['abnormal_trend']?.length || 0,
      },
      bySeverity: {
        high: severityCounts['high'] || 0,
        medium: severityCounts['medium'] || 0,
        low: severityCounts['low'] || 0,
      },
    };
  }
}

export const anomalyDetector = new AnomalyDetector();
