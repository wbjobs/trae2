import { SensorData, FeatureData, FeaturesResponse } from '../../shared/types';
import {
  calculateMean,
  calculateStd,
  calculateMax,
  calculateMin,
  calculateTrend,
  calculateVolatility,
} from '../utils/statistics';

function extractSingleFeature(values: number[], decimals: number = 2): FeatureData {
  const mean = calculateMean(values);
  const std = calculateStd(values, mean);
  
  return {
    mean: parseFloat(mean.toFixed(decimals)),
    std: parseFloat(std.toFixed(decimals)),
    max: parseFloat(calculateMax(values).toFixed(decimals)),
    min: parseFloat(calculateMin(values).toFixed(decimals)),
    trend: calculateTrend(values),
    volatility: parseFloat(calculateVolatility(values, mean, std).toFixed(2)),
  };
}

export function extractFeatures(data: SensorData[]): FeaturesResponse {
  const temperatures = new Array(data.length);
  const humidities = new Array(data.length);
  const co2s = new Array(data.length);
  const ch4s = new Array(data.length);

  for (let i = 0; i < data.length; i++) {
    temperatures[i] = data[i].temperature;
    humidities[i] = data[i].humidity;
    co2s[i] = data[i].gasConcentration.co2;
    ch4s[i] = data[i].gasConcentration.ch4;
  }

  return {
    temperature: extractSingleFeature(temperatures, 2),
    humidity: extractSingleFeature(humidities, 2),
    co2: extractSingleFeature(co2s, 2),
    ch4: extractSingleFeature(ch4s, 4),
  };
}

export function extractTimeSeriesFeatures(
  data: SensorData[],
  windowSize: number = 60
): Array<{ timestamp: number; features: FeaturesResponse }> {
  const result: Array<{ timestamp: number; features: FeaturesResponse }> = [];
  
  for (let i = 0; i < data.length; i += windowSize) {
    const window = data.slice(i, Math.min(i + windowSize, data.length));
    if (window.length > 10) {
      result.push({
        timestamp: window[Math.floor(window.length / 2)].timestamp,
        features: extractFeatures(window),
      });
    }
  }
  
  return result;
}
