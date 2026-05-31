import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { SoundingData } from '@/types';

export class ComparisonExporter {
  public exportComparison(
    dataList: SoundingData[],
    field: 'temperature' | 'dewPoint' | 'relativeHumidity' | 'windSpeed',
    filename: string
  ): void {
    const wb = XLSX.utils.book_new();

    const infoSheet = this.createComparisonInfoSheet(dataList, field);
    XLSX.utils.book_append_sheet(wb, infoSheet, '对比信息');

    const dataSheet = this.createComparisonDataSheet(dataList, field);
    XLSX.utils.book_append_sheet(wb, dataSheet, '对比数据');

    const statsSheet = this.createStatisticsSheet(dataList, field);
    XLSX.utils.book_append_sheet(wb, statsSheet, '统计分析');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob, `${filename}.xlsx`);
  }

  private createComparisonInfoSheet(
    dataList: SoundingData[],
    field: string
  ): XLSX.WorkSheet {
    const fieldNames: Record<string, string> = {
      temperature: '温度',
      dewPoint: '露点',
      relativeHumidity: '相对湿度',
      windSpeed: '风速'
    };

    const info = [
      ['多站点廓线数据对比分析报告', ''],
      ['', ''],
      ['对比要素', fieldNames[field] || field],
      ['导出时间', new Date().toLocaleString()],
      ['站点数量', dataList.length],
      ['', ''],
      ['参与对比站点：', ''],
      ['序号', '站点编号', '站点名称', '探空时间', '最大高度(m)', '数据层数']
    ];

    dataList.forEach((data, index) => {
      info.push([
        index + 1,
        data.stationId,
        data.stationName,
        data.soundingTime,
        data.maxHeight,
        data.dataPoints.length
      ]);
    });

    return XLSX.utils.aoa_to_sheet(info);
  }

  private createComparisonDataSheet(
    dataList: SoundingData[],
    field: string
  ): XLSX.WorkSheet {
    const allHeights = this.extractCommonHeights(dataList);

    const headers = ['高度(m)', ...dataList.map(d => d.stationName)];

    const rows = allHeights.map(height => {
      const row = [height];
      dataList.forEach(data => {
        const value = this.interpolateValueAtHeight(data.dataPoints, height, field as keyof any);
        row.push(value !== null ? value : '-');
      });
      return row;
    });

    return XLSX.utils.aoa_to_sheet([headers, ...rows]);
  }

  private createStatisticsSheet(
    dataList: SoundingData[],
    field: string
  ): XLSX.WorkSheet {
    const fieldUnits: Record<string, string> = {
      temperature: '°C',
      dewPoint: '°C',
      relativeHumidity: '%',
      windSpeed: 'm/s'
    };
    const unit = fieldUnits[field] || '';

    const headers = ['站点', `最大值(${unit})`, `最小值(${unit})`, `平均值(${unit})`, `标准差(${unit})`];

    const rows = dataList.map(data => {
      const values = data.dataPoints.map(p => p[field as keyof any] as number).filter(v => !isNaN(v));
      const max = Math.max(...values);
      const min = Math.min(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const std = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length);

      return [
        data.stationName,
        max.toFixed(1),
        min.toFixed(1),
        avg.toFixed(1),
        std.toFixed(1)
      ];
    });

    return XLSX.utils.aoa_to_sheet([headers, ...rows]);
  }

  private extractCommonHeights(dataList: SoundingData[]): number[] {
    const heightSet = new Set<number>();
    dataList.forEach(data => {
      data.dataPoints.forEach(p => {
        const roundedHeight = Math.round(p.height / 100) * 100;
        heightSet.add(roundedHeight);
      });
    });
    return Array.from(heightSet).sort((a, b) => a - b);
  }

  private interpolateValueAtHeight(
    points: any[],
    targetHeight: number,
    field: keyof any
  ): number | null {
    if (points.length < 2) return null;

    const sorted = [...points].sort((a, b) => a.height - b.height);

    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];

      if (targetHeight >= p1.height && targetHeight <= p2.height) {
        if (p2.height === p1.height) {
          const val = p1[field];
          return typeof val === 'number' ? val : null;
        }

        const ratio = (targetHeight - p1.height) / (p2.height - p1.height);
        const v1 = p1[field];
        const v2 = p2[field];

        if (typeof v1 === 'number' && typeof v2 === 'number') {
          return Math.round((v1 + (v2 - v1) * ratio) * 10) / 10;
        }
        return null;
      }
    }

    return null;
  }
}

export const comparisonExporter = new ComparisonExporter();
