import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ExportData } from './types';

export class ExcelExporter {
  public export(data: ExportData, filename: string): void {
    const wb = XLSX.utils.book_new();

    const infoSheet = this.createInfoSheet(data);
    XLSX.utils.book_append_sheet(wb, infoSheet, '基本信息');

    if (data.includeRawData !== false) {
      const dataSheet = this.createRawDataSheet(data);
      XLSX.utils.book_append_sheet(wb, dataSheet, '廓线数据');
    }

    if (data.indices) {
      const indicesSheet = this.createIndicesSheet(data);
      XLSX.utils.book_append_sheet(wb, indicesSheet, '气象指标');
    }

    if (data.qualityReport) {
      const qualitySheet = this.createQualitySheet(data);
      XLSX.utils.book_append_sheet(wb, qualitySheet, '质量报告');
    }

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob, `${filename}.xlsx`);
  }

  private createInfoSheet(data: ExportData): XLSX.WorkSheet {
    const info = [
      ['探空数据报表', ''],
      ['', ''],
      ['站点编号', data.soundingData.stationId],
      ['站点名称', data.soundingData.stationName],
      ['探空时间', data.soundingData.soundingTime],
      ['纬度', data.soundingData.latitude],
      ['经度', data.soundingData.longitude],
      ['海拔高度', `${data.soundingData.elevation} m`],
      ['最大探测高度', `${data.soundingData.maxHeight} m`],
      ['数据点数', data.soundingData.dataPoints.length]
    ];

    return XLSX.utils.aoa_to_sheet(info);
  }

  private createRawDataSheet(data: ExportData): XLSX.WorkSheet {
    const headers = [
      '气压(hPa)', '高度(m)', '温度(°C)', '露点(°C)',
      '相对湿度(%)', '风速(m/s)', '风向(°)', 'U风(m/s)', 'V风(m/s)'
    ];

    const rows = data.soundingData.dataPoints.map(p => [
      p.pressure, p.height, p.temperature, p.dewPoint,
      p.relativeHumidity, p.windSpeed, p.windDirection,
      Math.round(p.uWind * 10) / 10, Math.round(p.vWind * 10) / 10
    ]);

    return XLSX.utils.aoa_to_sheet([headers, ...rows]);
  }

  private createIndicesSheet(data: ExportData): XLSX.WorkSheet {
    const headers = ['指标名称', '数值', '单位', '描述'];
    const rows: any[][] = [];

    if (data.indices) {
      rows.push(['=== 稳定度指标 ===', '', '', '']);
      data.indices.stability.forEach(idx => {
        rows.push([idx.name, idx.value, idx.unit, idx.description]);
      });

      rows.push(['', '', '', '']);
      rows.push(['=== 风场指标 ===', '', '', '']);
      data.indices.wind.forEach(idx => {
        rows.push([idx.name, idx.value, idx.unit, idx.description]);
      });

      rows.push(['', '', '', '']);
      rows.push(['=== 热力学指标 ===', '', '', '']);
      data.indices.thermodynamic.forEach(idx => {
        rows.push([idx.name, idx.value, idx.unit, idx.description]);
      });
    }

    return XLSX.utils.aoa_to_sheet([headers, ...rows]);
  }

  private createQualitySheet(data: ExportData): XLSX.WorkSheet {
    if (!data.qualityReport) return XLSX.utils.aoa_to_sheet([]);

    const report = data.qualityReport;
    const rows = [
      ['数据质量报告', ''],
      ['', ''],
      ['总数据点数', report.totalPoints],
      ['有效数据点数', report.validPoints],
      ['无效数据点数', report.invalidPoints],
      ['质量评分', `${report.qualityScore}/100`],
      ['', ''],
      ['缺失字段统计', ''],
      ['字段', '缺失数量']
    ];

    Object.entries(report.missingFields || {}).forEach(([field, count]) => {
      rows.push([field, count as number]);
    });

    return XLSX.utils.aoa_to_sheet(rows);
  }
}

export const excelExporter = new ExcelExporter();
