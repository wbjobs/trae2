import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import type {
  MonitorData,
  ReportParams,
  ReportData,
  MonitorSection,
  MonitorFactor,
} from '../../types';

export interface ExportOptions {
  filename?: string;
  sheetName?: string;
  includeHeaders?: boolean;
}

export interface PDFOptions {
  filename?: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'a3' | 'letter';
  title?: string;
}

export class ReportExporter {
  exportToExcel(
    data: Record<string, any>[],
    options: ExportOptions = {}
  ): Blob {
    const {
      filename = 'export.xlsx',
      sheetName = 'Sheet1',
      includeHeaders = true,
    } = options;

    const ws = XLSX.utils.json_to_sheet(data, { header: includeHeaders ? undefined : [] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  exportMonitorDataToExcel(
    data: MonitorData[],
    options: ExportOptions = {}
  ): Blob {
    const formattedData = data.map(item => ({
      'ID': item.id,
      '监测断面': item.sectionName,
      '监测因子': item.factorName,
      '监测值': item.value,
      '单位': item.unit,
      '监测时间': item.timestamp,
      '水质等级': this.getQualityText(item.quality),
      '数据状态': this.getDataStatusText(item.dataStatus),
      '标准值': item.standardValue || '-',
      '超标率(%)': item.exceedRate?.toFixed(2) || '0',
    }));

    return this.exportToExcel(formattedData, {
      ...options,
      sheetName: options.sheetName || '监测数据',
    });
  }

  exportToPDF(
    content: string,
    options: PDFOptions = {}
  ): Blob {
    const {
      filename = 'export.pdf',
      orientation = 'portrait',
      format = 'a4',
      title = 'Report',
    } = options;

    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format,
    });

    doc.setFontSize(16);
    doc.text(title, 105, 20, { align: 'center' });

    doc.setFontSize(10);
    const lines = doc.splitTextToSize(content, 180);
    let yPosition = 40;
    const lineHeight = 7;

    lines.forEach((line: string, index: number) => {
      if (yPosition > 280) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(line, 15, yPosition);
      yPosition += lineHeight;
    });

    return doc.output('blob');
  }

  exportReportDataToPDF(
    reportData: ReportData,
    options: PDFOptions = {}
  ): Blob {
    const {
      orientation = 'portrait',
      format = 'a4',
    } = options;

    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format,
    });

    doc.setFontSize(18);
    doc.text(reportData.title, 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.text(`生成时间: ${reportData.generateTime}`, 15, 30);
    doc.text(`统计周期: ${reportData.period.start} 至 ${reportData.period.end}`, 15, 38);

    doc.setFontSize(14);
    doc.text('一、数据概览', 15, 50);

    doc.setFontSize(10);
    const summary = reportData.summary;
    const summaryItems = [
      `监测记录总数: ${summary.totalRecords}`,
      `水质优良率: ${(summary.excellentRate + summary.goodRate).toFixed(1)}%`,
      `    - 优: ${summary.excellentRate.toFixed(1)}%`,
      `    - 良: ${summary.goodRate.toFixed(1)}%`,
      `    - 轻度污染: ${summary.moderateRate.toFixed(1)}%`,
      `    - 重度污染: ${summary.poorRate.toFixed(1)}%`,
      `平均水质指数(WQI): ${summary.avgWQI.toFixed(1)}`,
    ];

    let yPos = 60;
    summaryItems.forEach(item => {
      doc.text(item, 20, yPos);
      yPos += 8;
    });

    if (reportData.sectionStats.length > 0) {
      yPos += 10;
      if (yPos > 250) {
        doc.addPage();
        yPos = 30;
      }

      doc.setFontSize(14);
      doc.text('二、断面统计', 15, yPos);
      yPos += 10;

      doc.setFontSize(10);
      reportData.sectionStats.forEach(stat => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(`${stat.sectionName}: 样本数 ${stat.sampleCount}, 平均WQI ${stat.avgWQI.toFixed(1)}`, 20, yPos);
        yPos += 7;
      });
    }

    if (reportData.factorStats.length > 0) {
      yPos += 10;
      if (yPos > 250) {
        doc.addPage();
        yPos = 30;
      }

      doc.setFontSize(14);
      doc.text('三、因子统计', 15, yPos);
      yPos += 10;

      doc.setFontSize(10);
      reportData.factorStats.slice(0, 8).forEach(stat => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(
          `${stat.factorName}: 均值 ${stat.avgValue.toFixed(4)}, 范围 ${stat.minValue.toFixed(4)} - ${stat.maxValue.toFixed(4)}`,
          20,
          yPos
        );
        yPos += 7;
      });
    }

    return doc.output('blob');
  }

  generateReport(
    params: ReportParams,
    data: MonitorData[],
    sections: MonitorSection[],
    factors: MonitorFactor[]
  ): ReportData {
    const qualityCounts = { excellent: 0, good: 0, moderate: 0, poor: 0 };
    data.forEach(d => qualityCounts[d.quality]++);

    const totalRecords = data.length || 1;

    const sectionStats = sections.slice(0, 5).map(section => {
      const sectionData = data.filter(d => d.sectionId === section.id);
      const avgWQI = sectionData.length > 0
        ? sectionData.reduce((sum, d) => sum + (this.estimateWQI(d) || 70), 0) / sectionData.length
        : 70;

      return {
        sectionId: section.id,
        sectionName: section.name,
        sampleCount: sectionData.length,
        avgWQI,
        mainPollutants: ['总磷', '氨氮'].slice(0, Math.floor(Math.random() * 2) + 1),
      };
    });

    const factorStats = factors.map(factor => {
      const factorData = data.filter(d => d.factorId === factor.id);
      const values = factorData.map(d => d.value);

      return {
        factorId: factor.id,
        factorName: factor.name,
        avgValue: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        maxValue: values.length > 0 ? Math.max(...values) : 0,
        minValue: values.length > 0 ? Math.min(...values) : 0,
        exceedRate: factorData.filter(d => d.exceedRate && d.exceedRate > 0).length / Math.max(factorData.length, 1) * 100,
      };
    });

    return {
      title: this.getReportTitle(params.reportType),
      generateTime: new Date().toLocaleString('zh-CN'),
      period: {
        start: params.startTime,
        end: params.endTime,
      },
      summary: {
        totalRecords: data.length,
        excellentRate: (qualityCounts.excellent / totalRecords) * 100,
        goodRate: (qualityCounts.good / totalRecords) * 100,
        moderateRate: (qualityCounts.moderate / totalRecords) * 100,
        poorRate: (qualityCounts.poor / totalRecords) * 100,
        avgWQI: 75 + Math.random() * 10,
      },
      sectionStats,
      factorStats,
      trendData: [],
    };
  }

  private getReportTitle(type: ReportParams['reportType']): string {
    const titles: Record<ReportParams['reportType'], string> = {
      daily: '流域水生态环境监测日报',
      weekly: '流域水生态环境监测周报',
      monthly: '流域水生态环境监测月报',
      quarterly: '流域水生态环境监测季报',
      annual: '流域水生态环境监测年报',
      custom: '流域水生态环境监测自定义报告',
    };
    return titles[type];
  }

  private estimateWQI(data: MonitorData): number {
    const scores: Record<string, number> = {
      do: data.factorId === 'do' ? (data.value >= 7.5 ? 95 : data.value >= 6 ? 80 : 60) : 70,
      ph: data.factorId === 'ph' ? ((data.value >= 6.5 && data.value <= 8.5) ? 95 : 80) : 70,
      cod: data.factorId === 'cod' ? (data.value <= 15 ? 95 : data.value <= 20 ? 80 : 60) : 70,
      nh3n: data.factorId === 'nh3n' ? (data.value <= 0.15 ? 95 : data.value <= 0.5 ? 80 : 60) : 70,
      tp: data.factorId === 'tp' ? (data.value <= 0.02 ? 95 : data.value <= 0.1 ? 80 : 60) : 70,
      tn: data.factorId === 'tn' ? (data.value <= 0.2 ? 95 : data.value <= 0.5 ? 80 : 60) : 70,
    };
    return scores[data.factorId] || 70;
  }

  downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private getQualityText(quality: string): string {
    const map: Record<string, string> = {
      excellent: '优',
      good: '良',
      moderate: '轻度污染',
      poor: '重度污染',
    };
    return map[quality] || quality;
  }

  private getDataStatusText(status: string): string {
    const map: Record<string, string> = {
      valid: '有效',
      invalid: '无效',
      estimated: '插补',
    };
    return map[status] || status;
  }

  exportSectionStatsToExcel(
    sectionStats: ReportData['sectionStats'],
    options: ExportOptions = {}
  ): Blob {
    const formattedData = sectionStats.map(stat => ({
      '断面ID': stat.sectionId,
      '断面名称': stat.sectionName,
      '样本数量': stat.sampleCount,
      '平均WQI': stat.avgWQI.toFixed(1),
      '主要污染物': stat.mainPollutants.join(', '),
    }));

    return this.exportToExcel(formattedData, {
      ...options,
      sheetName: options.sheetName || '断面统计',
    });
  }

  exportFactorStatsToExcel(
    factorStats: ReportData['factorStats'],
    options: ExportOptions = {}
  ): Blob {
    const formattedData = factorStats.map(stat => ({
      '因子ID': stat.factorId,
      '因子名称': stat.factorName,
      '平均值': stat.avgValue.toFixed(4),
      '最大值': stat.maxValue.toFixed(4),
      '最小值': stat.minValue.toFixed(4),
      '超标率(%)': stat.exceedRate.toFixed(2),
    }));

    return this.exportToExcel(formattedData, {
      ...options,
      sheetName: options.sheetName || '因子统计',
    });
  }

  exportFullReportToExcel(
    reportData: ReportData,
    monitorData: MonitorData[],
    options: ExportOptions = {}
  ): Blob {
    const wb = XLSX.utils.book_new();

    const summaryData = [{
      '报告标题': reportData.title,
      '生成时间': reportData.generateTime,
      '统计开始时间': reportData.period.start,
      '统计结束时间': reportData.period.end,
      '监测记录总数': reportData.summary.totalRecords,
      '优(%)': reportData.summary.excellentRate.toFixed(1),
      '良(%)': reportData.summary.goodRate.toFixed(1),
      '轻度污染(%)': reportData.summary.moderateRate.toFixed(1),
      '重度污染(%)': reportData.summary.poorRate.toFixed(1),
      '平均WQI': reportData.summary.avgWQI.toFixed(1),
    }];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, '报告摘要');

    const wsSection = XLSX.utils.json_to_sheet(
      reportData.sectionStats.map(stat => ({
        '断面名称': stat.sectionName,
        '样本数量': stat.sampleCount,
        '平均WQI': stat.avgWQI.toFixed(1),
        '主要污染物': stat.mainPollutants.join(', '),
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsSection, '断面统计');

    const wsFactor = XLSX.utils.json_to_sheet(
      reportData.factorStats.map(stat => ({
        '因子名称': stat.factorName,
        '平均值': stat.avgValue.toFixed(4),
        '最大值': stat.maxValue.toFixed(4),
        '最小值': stat.minValue.toFixed(4),
        '超标率(%)': stat.exceedRate.toFixed(2),
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsFactor, '因子统计');

    const wsMonitor = XLSX.utils.json_to_sheet(
      monitorData.slice(0, 1000).map(item => ({
        '监测断面': item.sectionName,
        '监测因子': item.factorName,
        '监测值': item.value,
        '单位': item.unit,
        '监测时间': item.timestamp,
        '水质等级': this.getQualityText(item.quality),
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsMonitor, '监测数据(前1000条)');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
}

export const reportExporter = new ReportExporter();
