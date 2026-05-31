import { SoundingDataPoint } from '@/types';
import {
  IndexResult,
  AtmosphericStabilityIndices,
  WindIndices,
  ThermodynamicIndices,
  AllCalculatedIndices
} from './types';

export class MeteorologicalIndexCalculator {
  private points: SoundingDataPoint[];

  constructor(points: SoundingDataPoint[]) {
    this.points = [...points].sort((a, b) => b.pressure - a.pressure);
  }

  public calculateAll(): AllCalculatedIndices {
    return {
      stability: this.calculateStabilityIndices(),
      wind: this.calculateWindIndices(),
      thermodynamic: this.calculateThermodynamicIndices()
    };
  }

  public calculateStabilityIndices(): AtmosphericStabilityIndices {
    return {
      cape: this.calculateCAPE(),
      cin: this.calculateCIN(),
      liftedIndex: this.calculateLiftedIndex(),
      showalterIndex: this.calculateShowalterIndex(),
      kIndex: this.calculateKIndex(),
      totalTotalsIndex: this.calculateTotalTotalsIndex(),
      convectiveInhibition: this.calculateConvectiveInhibition(),
      equilibriumLevel: this.calculateEquilibriumLevel(),
      levelOfFreeConvection: this.calculateLFC(),
      convectiveCondensationLevel: this.calculateCCL(),
      liftingCondensationLevel: this.calculateLCL()
    };
  }

  public calculateWindIndices(): WindIndices {
    return {
      maxWindSpeed: this.calculateMaxWindSpeed(),
      maxWindHeight: this.calculateMaxWindHeight(),
      windShear0_6km: this.calculateWindShear(0, 6000),
      windShear0_1km: this.calculateWindShear(0, 1000),
      bulkRichardsonNumber: this.calculateBulkRichardsonNumber()
    };
  }

  public calculateThermodynamicIndices(): ThermodynamicIndices {
    return {
      convectiveAvailablePotentialEnergy: this.calculateCAPE(),
      precipitableWater: this.calculatePrecipitableWater(),
      surfaceBasedCAPE: this.calculateSurfaceBasedCAPE(),
      mostUnstableCAPE: this.calculateMostUnstableCAPE(),
      mixedLayerCAPE: this.calculateMixedLayerCAPE()
    };
  }

  private calculateCAPE(): IndexResult {
    let cape = 0;
    const surfacePoint = this.points[0];
    if (!surfacePoint) return this.createResult('CAPE', 0, 'J/kg', '对流有效位能', '抬升气块与环境温度差积分');

    const lfc = this.findLFC();
    const el = this.findEL();

    if (lfc && el) {
      for (let i = 0; i < this.points.length - 1; i++) {
        const p1 = this.points[i];
        const p2 = this.points[i + 1];

        if (p1.height >= lfc.height && p2.height <= el.height) {
          const parcelTemp = this.calculateParcelTemperature(surfacePoint, p1.pressure);
          const envTemp = p1.temperature;
          const thickness = p2.height - p1.height;
          cape += Math.max(0, (parcelTemp - envTemp) * thickness * 9.81 / (envTemp + 273.15));
        }
      }
    }

    return this.createResult('CAPE', Math.round(cape), 'J/kg', '对流有效位能', '抬升气块与环境温度差积分');
  }

  private calculateCIN(): IndexResult {
    let cin = 0;
    const surfacePoint = this.points[0];
    if (!surfacePoint) return this.createResult('CIN', 0, 'J/kg', '对流抑制能量', 'LFC以下气块负浮力积分');

    const lfc = this.findLFC();
    const lcl = this.findLCL();

    if (lcl && lfc) {
      for (let i = 0; i < this.points.length - 1; i++) {
        const p1 = this.points[i];
        const p2 = this.points[i + 1];

        if (p1.height >= lcl.height && p2.height <= lfc.height) {
          const parcelTemp = this.calculateParcelTemperature(surfacePoint, p1.pressure);
          const envTemp = p1.temperature;
          const thickness = p2.height - p1.height;
          cin += Math.min(0, (parcelTemp - envTemp) * thickness * 9.81 / (envTemp + 273.15));
        }
      }
    }

    return this.createResult('CIN', Math.round(cin), 'J/kg', '对流抑制能量', 'LFC以下气块负浮力积分');
  }

  private calculateLiftedIndex(): IndexResult {
    const surfacePoint = this.points[0];
    const p500 = this.points.find(p => Math.abs(p.pressure - 500) < 10);

    if (!surfacePoint || !p500) {
      return this.createResult('抬升指数', 0, '°C', '500hPa处环境温与抬升气温差', 'LI = T_env(500hPa) - T_parcel(500hPa)');
    }

    const parcelTemp = this.calculateParcelTemperature(surfacePoint, 500);
    const li = p500.temperature - parcelTemp;

    return this.createResult('抬升指数', Math.round(li * 10) / 10, '°C', '500hPa处环境温与抬升气温差', 'LI = T_env(500hPa) - T_parcel(500hPa)');
  }

  private calculateShowalterIndex(): IndexResult {
    const p850 = this.points.find(p => Math.abs(p.pressure - 850) < 10);
    const p500 = this.points.find(p => Math.abs(p.pressure - 500) < 10);

    if (!p850 || !p500) {
      return this.createResult('肖沃尔特指数', 0, '°C', '850hPa气块抬升至500hPa温度差', 'SI = T_env(500hPa) - T_parcel(500hPa)');
    }

    const parcelTemp = this.calculateParcelTemperature(p850, 500);
    const si = p500.temperature - parcelTemp;

    return this.createResult('肖沃尔特指数', Math.round(si * 10) / 10, '°C', '850hPa气块抬升至500hPa温度差', 'SI = T_env(500hPa) - T_parcel(500hPa)');
  }

  private calculateKIndex(): IndexResult {
    const p850 = this.points.find(p => Math.abs(p.pressure - 850) < 10);
    const p700 = this.points.find(p => Math.abs(p.pressure - 700) < 10);
    const p500 = this.points.find(p => Math.abs(p.pressure - 500) < 10);

    if (!p850 || !p700 || !p500) {
      return this.createResult('K指数', 0, '°C', '综合稳定度和湿度的雷暴潜势指标', 'K = (T850-T500) + Td850 - (T700-Td700)');
    }

    const kIndex = (p850.temperature - p500.temperature) + p850.dewPoint - (p700.temperature - p700.dewPoint);

    return this.createResult('K指数', Math.round(kIndex * 10) / 10, '°C', '综合稳定度和湿度的雷暴潜势指标', 'K = (T850-T500) + Td850 - (T700-Td700)');
  }

  private calculateTotalTotalsIndex(): IndexResult {
    const p850 = this.points.find(p => Math.abs(p.pressure - 850) < 10);
    const p500 = this.points.find(p => Math.abs(p.pressure - 500) < 10);

    if (!p850 || !p500) {
      return this.createResult('总指数', 0, '°C', '雷暴强度指数', 'TT = (T850 + Td850) - 2*T500');
    }

    const tt = (p850.temperature + p850.dewPoint) - 2 * p500.temperature;

    return this.createResult('总指数', Math.round(tt * 10) / 10, '°C', '雷暴强度指数', 'TT = (T850 + Td850) - 2*T500');
  }

  private calculateConvectiveInhibition(): IndexResult {
    const cin = this.calculateCIN();
    return this.createResult('对流抑制', cin.value, 'J/kg', '阻止气块抬升的能量', 'LCL到LFC间负浮力积分');
  }

  private calculateEquilibriumLevel(): IndexResult {
    const el = this.findEL();
    return this.createResult('平衡高度', el ? el.height : 0, 'm', '气块浮力等于零的高度', '气块温=环境温的高度');
  }

  private calculateLFC(): IndexResult {
    const lfc = this.findLFC();
    return this.createResult('自由对流高度', lfc ? lfc.height : 0, 'm', '气块开始自由上升的高度', '气块温首次等于环境温的高度');
  }

  private calculateCCL(): IndexResult {
    const ccl = this.findCCL();
    return this.createResult('对流凝结高度', ccl ? ccl.height : 0, 'm', '地面气块干绝热抬升达到饱和的高度', '通过地面露点的等饱和比湿线');
  }

  private calculateLCL(): IndexResult {
    const lcl = this.findLCL();
    return this.createResult('抬升凝结高度', lcl ? lcl.height : 0, 'm', '气块抬升达到饱和的高度', '干绝热曲线与等饱和比湿线交点');
  }

  private calculateMaxWindSpeed(): IndexResult {
    if (this.points.length === 0) return this.createResult('最大风速', 0, 'm/s', '整层最大风速', '遍历所有高度层风速');

    const maxWind = Math.max(...this.points.map(p => p.windSpeed));
    return this.createResult('最大风速', Math.round(maxWind * 10) / 10, 'm/s', '整层最大风速', '遍历所有高度层风速');
  }

  private calculateMaxWindHeight(): IndexResult {
    if (this.points.length === 0) return this.createResult('最大风速高度', 0, 'm', '最大风速所在高度', '最大风速对应的高度');

    const maxWindPoint = this.points.reduce((max, p) => p.windSpeed > max.windSpeed ? p : max);
    return this.createResult('最大风速高度', maxWindPoint.height, 'm', '最大风速所在高度', '最大风速对应的高度');
  }

  private calculateWindShear(bottomHeight: number, topHeight: number): IndexResult {
    const bottomPoint = this.findPointByHeight(bottomHeight);
    const topPoint = this.findPointByHeight(topHeight);

    if (!bottomPoint || !topPoint) {
      return this.createResult('风切变', 0, 'm/s', `${bottomHeight/1000}-${topHeight/1000}km风切变`, '高空与地面风矢量差');
    }

    const du = topPoint.uWind - bottomPoint.uWind;
    const dv = topPoint.vWind - bottomPoint.vWind;
    const shear = Math.sqrt(du * du + dv * dv);

    return this.createResult(`${bottomHeight/1000}-${topHeight/1000}km风切变`, Math.round(shear * 10) / 10, 'm/s',
      `${bottomHeight/1000}-${topHeight/1000}km风切变`, '高空与地面风矢量差');
  }

  private calculateBulkRichardsonNumber(): IndexResult {
    const cape = this.calculateCAPE().value;
    const shear = this.calculateWindShear(0, 6000).value;

    if (shear === 0) return this.createResult('整体理查森数', 0, '', '对流风暴类型预测指标', 'BRN = CAPE / (0.5 * shear^2)');

    const brn = cape / (0.5 * shear * shear);
    return this.createResult('整体理查森数', Math.round(brn * 10) / 10, '', '对流风暴类型预测指标', 'BRN = CAPE / (0.5 * shear^2)');
  }

  private calculatePrecipitableWater(): IndexResult {
    if (this.points.length < 2) return this.createResult('可降水量', 0, 'mm', '整层大气水汽总量', '积分各层比湿');

    let pw = 0;
    const rhoWater = 1000;

    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];

      const q1 = this.calculateSpecificHumidity(p1);
      const q2 = this.calculateSpecificHumidity(p2);
      const qAvg = (q1 + q2) / 2;

      const dp = p1.pressure - p2.pressure;
      pw += (qAvg * dp) / (9.81 * rhoWater) * 1000;
    }

    return this.createResult('可降水量', Math.round(pw * 10) / 10, 'mm', '整层大气水汽总量', '积分各层比湿');
  }

  private calculateSurfaceBasedCAPE(): IndexResult {
    const cape = this.calculateCAPE();
    return this.createResult('地面CAPE', cape.value, 'J/kg', '地面气块抬升的对流有效位能', '基于地面气块计算');
  }

  private calculateMostUnstableCAPE(): IndexResult {
    let maxCAPE = 0;
    const surfacePoint = this.points[0];
    if (!surfacePoint) return this.createResult('最不稳定CAPE', 0, 'J/kg', '最不稳定气块的CAPE', '寻找最不稳定气块');

    for (let i = 0; i < Math.min(10, this.points.length); i++) {
      const startPoint = this.points[i];
      const cape = this.calculateCAPEFromPoint(startPoint);
      if (cape > maxCAPE) maxCAPE = cape;
    }

    return this.createResult('最不稳定CAPE', Math.round(maxCAPE), 'J/kg', '最不稳定气块的CAPE', '寻找最不稳定气块');
  }

  private calculateMixedLayerCAPE(): IndexResult {
    const surfacePoint = this.points[0];
    if (!surfacePoint) return this.createResult('混合层CAPE', 0, 'J/kg', '混合层气块的CAPE', '近地层混合平均');

    const mixedLayer = this.points.slice(0, Math.min(5, this.points.length));
    const avgTemp = mixedLayer.reduce((sum, p) => sum + p.temperature, 0) / mixedLayer.length;
    const avgDewPoint = mixedLayer.reduce((sum, p) => sum + p.dewPoint, 0) / mixedLayer.length;

    const mixedPoint: SoundingDataPoint = {
      ...surfacePoint,
      temperature: avgTemp,
      dewPoint: avgDewPoint
    };

    const cape = this.calculateCAPEFromPoint(mixedPoint);
    return this.createResult('混合层CAPE', Math.round(cape), 'J/kg', '混合层气块的CAPE', '近地层混合平均');
  }

  private calculateSpecificHumidity(point: SoundingDataPoint): number {
    const e = 6.112 * Math.exp(17.67 * point.dewPoint / (point.dewPoint + 243.5));
    const es = 6.112 * Math.exp(17.67 * point.temperature / (point.temperature + 243.5));
    const rh = (e / es) * 100;
    const w = (0.622 * e) / (point.pressure - e);
    return w / (1 + w);
  }

  private calculateParcelTemperature(startPoint: SoundingDataPoint, targetPressure: number): number {
    const lcl = this.calculateLCLPressure(startPoint);
    const dryAdiabat = this.calculateDryAdiabaticTemperature(startPoint.temperature, startPoint.pressure, targetPressure);

    if (targetPressure >= lcl) {
      return dryAdiabat;
    }

    const wetAdiabat = this.calculateMoistAdiabaticTemperature(startPoint, lcl, targetPressure);
    return wetAdiabat;
  }

  private calculateLCLPressure(point: SoundingDataPoint): number {
    const t = point.temperature + 273.15;
    const td = point.dewPoint + 273.15;
    const p = point.pressure;

    const lclPressure = p * Math.pow(td / t, 3.5);
    return lclPressure;
  }

  private calculateDryAdiabaticTemperature(startTemp: number, startPressure: number, targetPressure: number): number {
    return (startTemp + 273.15) * Math.pow(targetPressure / startPressure, 0.286) - 273.15;
  }

  private calculateMoistAdiabaticTemperature(startPoint: SoundingDataPoint, lclPressure: number, targetPressure: number): number {
    const lclTemp = this.calculateDryAdiabaticTemperature(startPoint.temperature, startPoint.pressure, lclPressure);
    const tLCL = lclTemp + 273.15;

    const temp = tLCL * Math.pow(targetPressure / lclPressure, 0.286) - 273.15;
    return temp + 3;
  }

  private calculateCAPEFromPoint(startPoint: SoundingDataPoint): number {
    let cape = 0;
    const lcl = this.calculateLCLPressure(startPoint);
    let foundLFC = false;

    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];

      if (p1.pressure < lcl) {
        const parcelTemp = this.calculateParcelTemperature(startPoint, p1.pressure);
        const envTemp = p1.temperature;

        if (parcelTemp > envTemp) {
          foundLFC = true;
          const thickness = p2.height - p1.height;
          cape += (parcelTemp - envTemp) * thickness * 9.81 / (envTemp + 273.15);
        } else if (foundLFC) {
          break;
        }
      }
    }

    return Math.max(0, cape);
  }

  private findLFC(): SoundingDataPoint | null {
    const surfacePoint = this.points[0];
    if (!surfacePoint) return null;

    for (const point of this.points) {
      const parcelTemp = this.calculateParcelTemperature(surfacePoint, point.pressure);
      if (parcelTemp >= point.temperature && point.pressure < 900) {
        return point;
      }
    }

    return null;
  }

  private findEL(): SoundingDataPoint | null {
    const surfacePoint = this.points[0];
    if (!surfacePoint) return null;

    let foundLFC = false;
    for (const point of this.points) {
      const parcelTemp = this.calculateParcelTemperature(surfacePoint, point.pressure);

      if (parcelTemp >= point.temperature) {
        foundLFC = true;
      } else if (foundLFC && parcelTemp < point.temperature) {
        return point;
      }
    }

    return this.points[this.points.length - 1] || null;
  }

  private findCCL(): SoundingDataPoint | null {
    const surfacePoint = this.points[0];
    if (!surfacePoint) return null;

    const es = 6.112 * Math.exp(17.67 * surfacePoint.dewPoint / (surfacePoint.dewPoint + 243.5));
    const ws = 0.622 * es / (surfacePoint.pressure - es);

    for (const point of this.points) {
      const e = 6.112 * Math.exp(17.67 * point.temperature / (point.temperature + 243.5));
      const w = 0.622 * e / (point.pressure - e);
      if (w <= ws) {
        return point;
      }
    }

    return null;
  }

  private findLCL(): SoundingDataPoint | null {
    const surfacePoint = this.points[0];
    if (!surfacePoint) return null;

    const lclPressure = this.calculateLCLPressure(surfacePoint);
    return this.findPointByPressure(lclPressure);
  }

  private findPointByHeight(height: number): SoundingDataPoint | null {
    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];

      if ((p1.height <= height && p2.height >= height) || (p1.height >= height && p2.height <= height)) {
        const ratio = (height - p1.height) / (p2.height - p1.height);
        return {
          pressure: p1.pressure + (p2.pressure - p1.pressure) * ratio,
          height,
          temperature: p1.temperature + (p2.temperature - p1.temperature) * ratio,
          dewPoint: p1.dewPoint + (p2.dewPoint - p1.dewPoint) * ratio,
          relativeHumidity: p1.relativeHumidity + (p2.relativeHumidity - p1.relativeHumidity) * ratio,
          windSpeed: p1.windSpeed + (p2.windSpeed - p1.windSpeed) * ratio,
          windDirection: p1.windDirection + (p2.windDirection - p1.windDirection) * ratio,
          uWind: p1.uWind + (p2.uWind - p1.uWind) * ratio,
          vWind: p1.vWind + (p2.vWind - p1.vWind) * ratio
        };
      }
    }

    return this.points[this.points.length - 1] || null;
  }

  private findPointByPressure(pressure: number): SoundingDataPoint | null {
    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];

      if ((p1.pressure >= pressure && p2.pressure <= pressure) || (p1.pressure <= pressure && p2.pressure >= pressure)) {
        const ratio = (pressure - p1.pressure) / (p2.pressure - p1.pressure);
        return {
          pressure,
          height: p1.height + (p2.height - p1.height) * ratio,
          temperature: p1.temperature + (p2.temperature - p1.temperature) * ratio,
          dewPoint: p1.dewPoint + (p2.dewPoint - p1.dewPoint) * ratio,
          relativeHumidity: p1.relativeHumidity + (p2.relativeHumidity - p1.relativeHumidity) * ratio,
          windSpeed: p1.windSpeed + (p2.windSpeed - p1.windSpeed) * ratio,
          windDirection: p1.windDirection + (p2.windDirection - p1.windDirection) * ratio,
          uWind: p1.uWind + (p2.uWind - p1.uWind) * ratio,
          vWind: p1.vWind + (p2.vWind - p1.vWind) * ratio
        };
      }
    }

    return this.points[this.points.length - 1] || null;
  }

  private createResult(
    name: string,
    value: number,
    unit: string,
    description: string,
    calculationMethod: string
  ): IndexResult {
    return {
      name,
      value,
      unit,
      description,
      calculationMethod
    };
  }
}

export const calculateIndices = (points: SoundingDataPoint[]): AllCalculatedIndices => {
  const calculator = new MeteorologicalIndexCalculator(points);
  return calculator.calculateAll();
};
