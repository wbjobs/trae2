import type { AlertRecord, AlertThreshold, StationFlow, PeakHourStat, StationStats } from './types.js';
import { getStations } from './data-generator.js';

let alertThresholds: AlertThreshold = {
  warning: 1500,
  danger: 2500,
  suddenIncreaseRate: 1.5,
  abnormalDropRate: 0.3
};

let alertRecords: AlertRecord[] = [];

export function getThresholds(): AlertThreshold {
  return alertThresholds;
}

export function updateThresholds(thresholds: Partial<AlertThreshold>): AlertThreshold {
  alertThresholds = { ...alertThresholds, ...thresholds };
  return alertThresholds;
}

export function checkAlerts(
  currentData: StationFlow[],
  previousData: StationFlow[]
): AlertRecord[] {
  const newAlerts: AlertRecord[] = [];
  const stations = getStations();

  currentData.forEach(current => {
    const previous = previousData.find(p => p.stationId === current.stationId);
    const station = stations.find(s => s.stationId === current.stationId);
    const stationName = station?.stationName || current.stationName;

    if (current.totalFlow >= alertThresholds.danger) {
      newAlerts.push({
        id: `alert-${Date.now()}-${current.stationId}-danger`,
        stationId: current.stationId,
        stationName,
        alertLevel: 'danger',
        alertType: 'high_flow',
        threshold: alertThresholds.danger,
        actualValue: current.totalFlow,
        timestamp: current.timestamp,
        message: `${stationName}客流超过危险阈值`
      });
    } else if (current.totalFlow >= alertThresholds.warning) {
      newAlerts.push({
        id: `alert-${Date.now()}-${current.stationId}-warning`,
        stationId: current.stationId,
        stationName,
        alertLevel: 'warning',
        alertType: 'high_flow',
        threshold: alertThresholds.warning,
        actualValue: current.totalFlow,
        timestamp: current.timestamp,
        message: `${stationName}客流超过预警阈值`
      });
    }

    if (previous) {
      const increaseRate = previous.totalFlow > 0 ? current.totalFlow / previous.totalFlow : 1;
      const dropRate = previous.totalFlow > 0 ? current.totalFlow / previous.totalFlow : 1;

      if (increaseRate >= alertThresholds.suddenIncreaseRate && current.totalFlow > 500) {
        newAlerts.push({
          id: `alert-${Date.now()}-${current.stationId}-increase`,
          stationId: current.stationId,
          stationName,
          alertLevel: 'warning',
          alertType: 'sudden_increase',
          threshold: alertThresholds.suddenIncreaseRate,
          actualValue: increaseRate,
          timestamp: current.timestamp,
          message: `${stationName}客流突增${Math.round((increaseRate - 1) * 100)}%`
        });
      }

      if (dropRate <= alertThresholds.abnormalDropRate && previous.totalFlow > 200) {
        newAlerts.push({
          id: `alert-${Date.now()}-${current.stationId}-drop`,
          stationId: current.stationId,
          stationName,
          alertLevel: 'warning',
          alertType: 'abnormal_drop',
          threshold: alertThresholds.abnormalDropRate,
          actualValue: dropRate,
          timestamp: current.timestamp,
          message: `${stationName}客流异常下降`
        });
      }
    }
  });

  alertRecords = [...newAlerts, ...alertRecords].slice(0, 100);
  return newAlerts;
}

export function getAlerts(limit: number = 50): AlertRecord[] {
  return alertRecords.slice(0, limit);
}

export function getAlertsByStation(stationId: string, limit: number = 20): AlertRecord[] {
  return alertRecords.filter(a => a.stationId === stationId).slice(0, limit);
}

export function getActiveAlertCount(): number {
  const oneMinuteAgo = Date.now() - 60000;
  return alertRecords.filter(a => new Date(a.timestamp).getTime() > oneMinuteAgo).length;
}

export function calculatePeakHourStats(historicalData: StationFlow[]): PeakHourStat[] {
  const stations = getStations();
  const hourFlows: Record<string, Record<number, number[]>> = {};

  historicalData.forEach(d => {
    const hour = new Date(d.timestamp).getHours();
    if (!hourFlows[d.stationId]) {
      hourFlows[d.stationId] = {};
    }
    if (!hourFlows[d.stationId][hour]) {
      hourFlows[d.stationId][hour] = [];
    }
    hourFlows[d.stationId][hour].push(d.totalFlow);
  });

  const results: PeakHourStat[] = [];

  stations.forEach(station => {
    const stationHourFlows = hourFlows[station.stationId] || {};
    const hourAvgs: { hour: number; avg: number }[] = [];

    Object.entries(stationHourFlows).forEach(([hour, flows]) => {
      hourAvgs.push({
        hour: parseInt(hour),
        avg: flows.reduce((a, b) => a + b, 0) / flows.length
      });
    });

    hourAvgs.sort((a, b) => b.avg - a.avg);
    const peakThreshold = hourAvgs.length > 0 ? hourAvgs[0].avg * 0.7 : 0;

    hourAvgs.forEach(h => {
      results.push({
        stationId: station.stationId,
        stationName: station.stationName,
        hour: h.hour,
        avgFlow: Math.round(h.avg),
        isPeak: h.avg >= peakThreshold
      });
    });
  });

  return results;
}

export function calculateStationStats(historicalData: StationFlow[]): StationStats[] {
  const stations = getStations();

  return stations.map(station => {
    const stationData = historicalData.filter(d => d.stationId === station.stationId);
    const totalFlows = stationData.map(d => d.totalFlow);

    if (totalFlows.length === 0) {
      return {
        stationId: station.stationId,
        stationName: station.stationName,
        totalFlowToday: 0,
        avgFlowPerHour: 0,
        peakFlow: 0,
        peakTime: '-',
        alertCount: 0
      };
    }

    const totalFlowToday = totalFlows.reduce((a, b) => a + b, 0);
    const avgFlowPerHour = Math.round(totalFlowToday / totalFlows.length);
    const peakFlow = Math.max(...totalFlows);
    const peakEntry = stationData.find(d => d.totalFlow === peakFlow);
    const peakTime = peakEntry ? new Date(peakEntry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-';
    const alertCount = alertRecords.filter(a => a.stationId === station.stationId).length;

    return {
      stationId: station.stationId,
      stationName: station.stationName,
      totalFlowToday,
      avgFlowPerHour,
      peakFlow,
      peakTime,
      alertCount
    };
  });
}
