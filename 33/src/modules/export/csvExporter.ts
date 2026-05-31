import { saveAs } from 'file-saver';
import { ExportData } from './types';

export class CSVExporter {
  public export(data: ExportData, filename: string): void {
    let csvContent = '';

    csvContent += this.createInfoSection(data);
    csvContent += '\n\n';

    if (data.includeRawData !== false) {
      csvContent += this.createRawDataSection(data);
    }

    if (data.indices) {
      csvContent += '\n\n';
      csvContent += this.createIndicesSection(data);
    }

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `${filename}.csv`);
  }

  private createInfoSection(data: ExportData): string {
    const lines = [
      '气象探空数据报表',
      '',
      '站点编号,' + data.soundingData.stationId,
      '站点名称,' + data.soundingData.stationName,
      '探空时间,' + data.soundingData.soundingTime,
      '纬度,' + data.soundingData.latitude,
      '经度,' + data.soundingData.longitude,
      '海拔高度(m),' + data.soundingData.elevation,
      '最大探测高度(m),' + data.soundingData.maxHeight,
      '数据点数,' + data.soundingData.dataPoints.length
    ];

    return lines.join('\n');
  }

  private createRawDataSection(data: ExportData): string {
    const headers = [
      '气压(hPa)', '高度(m)', '温度(°C)', '露点(°C)',
      '相对湿度(%)', '风速(m/s)', '风向(°)', 'U风(m/s)', 'V风(m/s)'
    ];

    const rows = data.soundingData.dataPoints.map(p => [
      p.pressure, p.height, p.temperature, p.dewPoint,
      p.relativeHumidity, p.windSpeed, p.windDirection,
      (Math.round(p.uWind * 10) / 10).toFixed(1),
      (Math.round(p.vWind * 10) / 10).toFixed(1)
    ].join(','));

    return [
      '=== 廓线数据 ===',
      headers.join(','),
      ...rows
    ].join('\n');
  }

  private createIndicesSection(data: ExportData): string {
    const sections: string[] = ['=== 气象指标 ==='];

    if (data.indices?.stability) {
      sections.push('稳定度指标');
      sections.push('指标名称,数值,单位,描述');
      data.indices.stability.forEach(idx => {
        sections.push(`${idx.name},${idx.value},${idx.unit},"${idx.description}"`);
      });
    }

    if (data.indices?.wind) {
      sections.push('');
      sections.push('风场指标');
      sections.push('指标名称,数值,单位,描述');
      data.indices.wind.forEach(idx => {
        sections.push(`${idx.name},${idx.value},${idx.unit},"${idx.description}"`);
      });
    }

    if (data.indices?.thermodynamic) {
      sections.push('');
      sections.push('热力学指标');
      sections.push('指标名称,数值,单位,描述');
      data.indices.thermodynamic.forEach(idx => {
        sections.push(`${idx.name},${idx.value},${idx.unit},"${idx.description}"`);
      });
    }

    return sections.join('\n');
  }
}

export const csvExporter = new CSVExporter();
