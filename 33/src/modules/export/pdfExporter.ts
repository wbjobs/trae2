import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { ExportData } from './types';

export class PDFExporter {
  public export(data: ExportData, filename: string): void {
    const doc = new jsPDF();

    this.addHeader(doc, data);
    this.addBasicInfo(doc, data);

    let yPosition = 60;

    if (data.indices) {
      yPosition = this.addIndicesSection(doc, data, yPosition);
    }

    if (data.includeRawData !== false) {
      yPosition = this.addRawDataSection(doc, data, yPosition);
    }

    doc.save(`${filename}.pdf`);
  }

  private addHeader(doc: jsPDF, data: ExportData): void {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('气象探空数据报表', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`生成时间: ${new Date().toLocaleString()}`, 105, 30, { align: 'center' });

    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);
  }

  private addBasicInfo(doc: jsPDF, data: ExportData): void {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('基本信息', 20, 45);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const info = [
      ['站点编号:', data.soundingData.stationId],
      ['站点名称:', data.soundingData.stationName],
      ['探空时间:', data.soundingData.soundingTime],
      ['经纬度:', `${data.soundingData.latitude.toFixed(4)}°N, ${data.soundingData.longitude.toFixed(4)}°E`],
      ['海拔高度:', `${data.soundingData.elevation} m`],
      ['最大高度:', `${data.soundingData.maxHeight} m`]
    ];

    let x = 20;
    let y = 52;

    info.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, x, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), x + 30, y);
      y += 7;
    });
  }

  private addIndicesSection(doc: jsPDF, data: ExportData, startY: number): number {
    let y = startY;

    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('气象指标', 20, y);
    y += 8;

    const allIndices: any[] = [];

    if (data.indices?.stability) {
      data.indices.stability.forEach(idx => allIndices.push([idx.name, `${idx.value} ${idx.unit}`, idx.description));
    }
    if (data.indices?.wind) {
      data.indices.wind.forEach(idx => allIndices.push([idx.name, `${idx.value} ${idx.unit}`, idx.description));
    }
    if (data.indices?.thermodynamic) {
      data.indices.thermodynamic.forEach(idx => allIndices.push([idx.name, `${idx.value} ${idx.unit}`, idx.description));
    }

    autoTable(doc, {
      startY: y,
      head: [['指标名称', '数值', '描述']],
      body: allIndices,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 20, right: 20 }
    });

    return (doc as any).lastAutoTable.finalY + 10;
  }

  private addRawDataSection(doc: jsPDF, data: ExportData, startY: number): number {
    let y = startY;

    if (y > 200) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('廓线数据', 20, y);
    y += 8;

    const headers = ['气压(hPa)', '高度(m)', '温度(°C)', '露点(°C)', '湿度(%)', '风速(m/s)', '风向(°)'];
    const rows = data.soundingData.dataPoints.slice(0, 30).map(p => [
      p.pressure, p.height, p.temperature, p.dewPoint,
      p.relativeHumidity, p.windSpeed, p.windDirection
    ]);

    autoTable(doc, {
      startY: y,
      head: [headers],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [82, 196, 26] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 10, right: 10 }
    });

    return (doc as any).lastAutoTable.finalY + 10;
  }
}

export const pdfExporter = new PDFExporter();
