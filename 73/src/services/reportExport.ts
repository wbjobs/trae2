import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FusedMonitoringData, ReportConfig, EcoIndexResult } from '@/types';
import { calcEcoIndices } from './ecoIndex';

function buildWaterQualityRows(data: FusedMonitoringData[]): string[][] {
  return data.map((d) => [
    d.timestamp,
    d.stationId,
    d.stationName,
    String(d.waterQuality.temperature),
    String(d.waterQuality.ph),
    String(d.waterQuality.dissolvedOxygen),
    String(d.waterQuality.conductivity),
    String(d.waterQuality.turbidity),
  ]);
}

function buildNutrientRows(data: FusedMonitoringData[]): string[][] {
  return data.map((d) => [
    d.timestamp,
    d.stationId,
    d.stationName,
    String(d.nutrient.totalNitrogen),
    String(d.nutrient.totalPhosphorus),
    String(d.nutrient.ammoniaNitrogen),
    String(d.nutrient.nitrateNitrogen),
  ]);
}

function buildPlanktonRows(data: FusedMonitoringData[]): string[][] {
  const rows: string[][] = [];
  for (const d of data) {
    const totalDensity = d.plankton.reduce((sum, p) => sum + p.density, 0);
    const totalBiomass = d.plankton.reduce((sum, p) => sum + p.biomass, 0);
    const speciesList = d.plankton.map((p) => `${p.species}:${p.density}`).join('; ');
    rows.push([
      d.timestamp,
      d.stationId,
      d.stationName,
      String(totalDensity),
      String(totalBiomass),
      speciesList,
    ]);
  }
  return rows;
}

function buildEcoIndexRows(data: FusedMonitoringData[]): string[][] {
  return data.map((d) => {
    const indices: EcoIndexResult = calcEcoIndices(d);
    return [
      d.timestamp,
      d.stationId,
      d.stationName,
      indices.shannonIndex.toFixed(4),
      indices.simpsonIndex.toFixed(4),
      indices.evennessIndex.toFixed(4),
      indices.margalefIndex.toFixed(4),
      indices.trophicLevelIndex.toFixed(2),
      indices.trophicLevel,
      indices.waterQualityLevel,
      String(indices.totalPhytoplanktonDensity),
      String(indices.totalZooplanktonDensity),
      indices.dominantSpecies.join(', '),
    ];
  });
}

function buildSheets(
  data: FusedMonitoringData[],
  config: ReportConfig,
): Record<string, { headers: string[]; rows: string[][] }> {
  const sheets: Record<string, { headers: string[]; rows: string[][] }> = {};

  if (config.indicators.waterQuality) {
    sheets['水质指标'] = {
      headers: ['时间', '站点ID', '站点名称', '水温(°C)', 'pH', '溶解氧(mg/L)', '电导率(μS/cm)', '浊度(NTU)'],
      rows: buildWaterQualityRows(data),
    };
  }

  if (config.indicators.nutrients) {
    sheets['营养盐'] = {
      headers: ['时间', '站点ID', '站点名称', '总氮(mg/L)', '总磷(mg/L)', '氨氮(mg/L)', '硝酸盐氮(mg/L)'],
      rows: buildNutrientRows(data),
    };
  }

  if (config.indicators.plankton) {
    sheets['浮游生物'] = {
      headers: ['时间', '站点ID', '站点名称', '总密度(ind/L)', '总生物量(mg/L)', '物种组成'],
      rows: buildPlanktonRows(data),
    };
  }

  if (config.indicators.ecoIndex) {
    sheets['生态指标'] = {
      headers: [
        '时间', '站点ID', '站点名称',
        'Shannon指数', 'Simpson指数', '均匀度指数', 'Margalef指数',
        '营养状态指数', '营养等级', '水质等级',
        '浮游植物密度', '浮游动物密度', '优势种',
      ],
      rows: buildEcoIndexRows(data),
    };
  }

  return sheets;
}

export function exportToExcel(data: FusedMonitoringData[], config: ReportConfig): void {
  const sheets = buildSheets(data, config);
  const wb = XLSX.utils.book_new();

  for (const [name, sheet] of Object.entries(sheets)) {
    const wsData = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  XLSX.writeFile(wb, `${config.title}.xlsx`);
}

export function exportToCSV(data: FusedMonitoringData[], config: ReportConfig): void {
  const sheets = buildSheets(data, config);
  const allHeaders: string[] = ['数据类型'];
  const allRows: string[][] = [];

  for (const [name, sheet] of Object.entries(sheets)) {
    if (allHeaders.length === 1) {
      allHeaders.push(...sheet.headers);
    }
    for (const row of sheet.rows) {
      allRows.push([name, ...row]);
    }
  }

  const csvContent = [allHeaders.join(','), ...allRows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${config.title}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToPDF(data: FusedMonitoringData[], config: ReportConfig): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(18);
  doc.text(config.title, 14, 20);

  doc.setFontSize(10);
  doc.text(`时间段: ${config.period.start} - ${config.period.end}`, 14, 28);
  doc.text(`监测站点: ${config.stations.join(', ')}`, 14, 34);

  const sheets = buildSheets(data, config);
  let yOffset = 42;

  for (const [name, sheet] of Object.entries(sheets)) {
    if (yOffset > 180) {
      doc.addPage();
      yOffset = 20;
    }

    doc.setFontSize(12);
    doc.text(name, 14, yOffset);
    yOffset += 4;

    autoTable(doc, {
      head: [sheet.headers],
      body: sheet.rows,
      startY: yOffset,
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [41, 128, 185] },
      margin: { left: 14 },
    });

    const docAny = doc as unknown as Record<string, Record<string, number>>;
    yOffset = docAny.lastAutoTable?.finalY ?? yOffset + 20;
    yOffset += 6;
  }

  doc.save(`${config.title}.pdf`);
}

export function generateReport(data: FusedMonitoringData[], config: ReportConfig): void {
  switch (config.format) {
    case 'excel':
      exportToExcel(data, config);
      break;
    case 'csv':
      exportToCSV(data, config);
      break;
    case 'pdf':
      exportToPDF(data, config);
      break;
  }
}
