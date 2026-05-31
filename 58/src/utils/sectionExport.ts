import type { Pipeline, Vec3 } from '@shared/types';
import { add, cross, distance, normalize, scale, sub } from './vector';

export function computeSectionPlane(
  position: number,
  axis: 'x' | 'y' | 'z',
): { normal: Vec3; constant: number } {
  const normal: Vec3 = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
  return { normal, constant: -position };
}

export function intersectCylinderPlane(
  pipeline: Pipeline,
  planeNormal: Vec3,
  planeConstant: number,
): { center: Vec3; radius: number; ellipse: { a: number; b: number; angle: number } } | null {
  const start = pipeline.startPoint;
  const end = pipeline.endPoint;
  const dir = sub(end, start);
  const dirLen = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
  if (dirLen < 1e-6) return null;

  const nd = planeNormal[0] * dir[0] + planeNormal[1] * dir[1] + planeNormal[2] * dir[2];
  if (Math.abs(nd) < 1e-8) return null;

  const t =
    -(planeConstant + planeNormal[0] * start[0] + planeNormal[1] * start[1] + planeNormal[2] * start[2]) / nd;
  if (t < 0 || t > 1) return null;

  const center: Vec3 = [
    start[0] + t * dir[0],
    start[1] + t * dir[1],
    start[2] + t * dir[2],
  ];

  const radius = pipeline.diameter / 2000;
  const cosTheta = Math.abs(nd) / dirLen;
  const a = radius;
  const b = radius / Math.max(cosTheta, 0.01);
  const axisDir = normalize(dir);
  const perp: Vec3 =
    Math.abs(axisDir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const tangent = normalize(cross(axisDir, perp));
  const angle = Math.atan2(
    planeNormal[0] * tangent[0] + planeNormal[1] * tangent[1] + planeNormal[2] * tangent[2],
    planeNormal[0] * axisDir[0] + planeNormal[1] * axisDir[1] + planeNormal[2] * axisDir[2],
  );

  return { center, radius, ellipse: { a, b, angle } };
}

export function renderSectionToCanvas(
  pipelines: Pipeline[],
  position: number,
  axis: 'x' | 'y' | 'z',
  width = 1200,
  height = 800,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#050b1c';
  ctx.fillRect(0, 0, width, height);

  const padding = 60;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  const plane = computeSectionPlane(position, axis);
  const intersections = pipelines
    .map((p) => intersectCylinderPlane(p, plane.normal, plane.constant))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (intersections.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('当前剖切位置无管线相交', width / 2, height / 2);
    return canvas.toDataURL('image/png');
  }

  const allX = intersections.flatMap((i) => [i.center[0] - i.radius, i.center[0] + i.radius]);
  const allY = intersections.flatMap((i) => [i.center[1] - i.radius, i.center[1] + i.radius]);
  const allZ = intersections.flatMap((i) => [i.center[2] - i.radius, i.center[2] + i.radius]);

  let uAxis: 'x' | 'y' | 'z';
  let uMin: number;
  let uMax: number;
  let vAxis: 'x' | 'y' | 'z';
  let vMin: number;
  let vMax: number;

  if (axis === 'x') {
    uAxis = 'z';
    vAxis = 'y';
    uMin = Math.min(...allZ);
    uMax = Math.max(...allZ);
    vMin = Math.min(...allY);
    vMax = Math.max(...allY);
  } else if (axis === 'y') {
    uAxis = 'x';
    vAxis = 'z';
    uMin = Math.min(...allX);
    uMax = Math.max(...allX);
    vMin = Math.min(...allZ);
    vMax = Math.max(...allZ);
  } else {
    uAxis = 'x';
    vAxis = 'y';
    uMin = Math.min(...allX);
    uMax = Math.max(...allX);
    vMin = Math.min(...allY);
    vMax = Math.max(...allY);
  }

  const pad = 2;
  uMin -= pad;
  uMax += pad;
  vMin -= pad;
  vMax += pad;

  const uRange = uMax - uMin || 1;
  const vRange = vMax - vMin || 1;
  const scaleX = plotW / uRange;
  const scaleY = plotH / vRange;
  const scale = Math.min(scaleX, scaleY);

  const toU = (v: number) => padding + (v - uMin) * scale;
  const toV = (v: number) => height - padding - (v - vMin) * scale;

  const typeColor: Record<string, string> = {
    water_supply: '#3ba7ff',
    drainage: '#8b6f47',
    gas: '#ffd23b',
    power: '#ff5c5c',
    telecom: '#a78bfa',
    heating: '#ff8a3b',
  };

  const typeLabel: Record<string, string> = {
    water_supply: '给水',
    drainage: '排水',
    gas: '燃气',
    power: '电力',
    telecom: '通信',
    heating: '热力',
  };

  ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
  ctx.lineWidth = 1;
  const gridStep = 1;
  for (let u = Math.ceil(uMin); u <= uMax; u += gridStep) {
    ctx.beginPath();
    ctx.moveTo(toU(u), padding);
    ctx.lineTo(toU(u), height - padding);
    ctx.stroke();
  }
  for (let v = Math.ceil(vMin); v <= vMax; v += gridStep) {
    ctx.beginPath();
    ctx.moveTo(padding, toV(v));
    ctx.lineTo(width - padding, toV(v));
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padding, padding, plotW, plotH);

  intersections.forEach((inter, idx) => {
    const pipeline = pipelines.find(
      (p) => distance(p.startPoint, inter.center) <= distance(p.startPoint, p.endPoint) + 1,
    );
    const type = pipeline?.type || 'water_supply';
    const color = typeColor[type] || '#888';
    const cx = toU(inter.center[0]);
    const cy = toV(inter.center[1]);
    const rx = inter.ellipse.a * scale;
    const ry = inter.ellipse.b * scale;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-inter.ellipse.angle);

    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color + '55';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (pipeline) {
      ctx.fillStyle = color;
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(pipeline.code, cx + rx + 4, cy - ry);
    }
  });

  ctx.fillStyle = '#00d4ff';
  ctx.font = 'bold 16px Orbitron, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`管廊横剖面图 - ${axis.toUpperCase()} = ${position.toFixed(2)}m`, padding, padding - 20);

  ctx.fillStyle = '#888';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    `${uAxis.toUpperCase()}轴: ${uMin.toFixed(1)} ~ ${uMax.toFixed(1)}m`,
    padding,
    height - padding + 20,
  );
  ctx.textAlign = 'right';
  ctx.fillText(
    `${vAxis.toUpperCase()}轴: ${vMin.toFixed(1)} ~ ${vMax.toFixed(1)}m`,
    width - padding,
    height - padding + 20,
  );

  const legendX = width - padding - 120;
  let legendY = padding + 10;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('图例', legendX, legendY);
  legendY += 18;
  Object.entries(typeLabel).forEach(([type, label]) => {
    ctx.fillStyle = typeColor[type];
    ctx.beginPath();
    ctx.rect(legendX, legendY - 8, 12, 12);
    ctx.fill();
    ctx.fillStyle = '#ddd';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, legendX + 18, legendY + 2);
    legendY += 18;
  });

  ctx.fillStyle = '#666';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`生成时间: ${new Date().toLocaleString()}`, width - padding, height - 8);

  return canvas.toDataURL('image/png');
}

export function downloadSectionImage(
  pipelines: Pipeline[],
  position: number,
  axis: 'x' | 'y' | 'z',
  filename?: string,
): void {
  const dataUrl = renderSectionToCanvas(pipelines, position, axis);
  if (!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download =
    filename || `管廊剖面图_${axis.toUpperCase()}_${position.toFixed(2)}m_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function exportSectionSVG(
  pipelines: Pipeline[],
  position: number,
  axis: 'x' | 'y' | 'z',
  width = 1200,
  height = 800,
): string {
  const plane = computeSectionPlane(position, axis);
  const intersections = pipelines
    .map((p) => intersectCylinderPlane(p, plane.normal, plane.constant))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const typeColor: Record<string, string> = {
    water_supply: '#3ba7ff',
    drainage: '#8b6f47',
    gas: '#ffd23b',
    power: '#ff5c5c',
    telecom: '#a78bfa',
    heating: '#ff8a3b',
  };

  const uAxis: 'x' | 'y' | 'z' = axis === 'x' ? 'z' : axis === 'y' ? 'x' : 'x';
  const vAxis: 'x' | 'y' | 'z' = axis === 'x' ? 'y' : axis === 'y' ? 'z' : 'y';
  const axisIdx = { x: 0, y: 1, z: 2 };
  const getU = (c: Vec3) => c[axisIdx[uAxis]];
  const getV = (c: Vec3) => c[axisIdx[vAxis]];

  const allU = intersections.flatMap((i) => [getU(i.center) - i.radius, getU(i.center) + i.radius]);
  const allV = intersections.flatMap((i) => [getV(i.center) - i.radius, getV(i.center) + i.radius]);
  const uMin = Math.min(...allU) - 2;
  const uMax = Math.max(...allU) + 2;
  const vMin = Math.min(...allV) - 2;
  const vMax = Math.max(...allV) + 2;
  const padding = 60;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;
  const scale = Math.min(plotW / (uMax - uMin || 1), plotH / (vMax - vMin || 1));
  const toU = (v: number) => padding + (v - uMin) * scale;
  const toV = (v: number) => height - padding - (v - vMin) * scale;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#050b1c"/>
  <rect x="${padding}" y="${padding}" width="${plotW}" height="${plotH}" fill="none" stroke="#00d4ff" stroke-opacity="0.3"/>
  <text x="${padding}" y="${padding - 10}" fill="#00d4ff" font-family="Orbitron, sans-serif" font-size="16" font-weight="bold">
    管廊横剖面图 - ${axis.toUpperCase()} = ${position.toFixed(2)}m
  </text>`;

  intersections.forEach((inter) => {
    const pipeline = pipelines.find(
      (p) => Math.abs(distance(p.startPoint, inter.center) + distance(inter.center, p.endPoint) - distance(p.startPoint, p.endPoint)) < 0.1,
    );
    const type = pipeline?.type || 'water_supply';
    const color = typeColor[type] || '#888';
    const cx = toU(getU(inter.center));
    const cy = toV(getV(inter.center));
    const rx = inter.ellipse.a * scale;
    const ry = inter.ellipse.b * scale;
    const rot = (-inter.ellipse.angle * 180) / Math.PI;
    svg += `\n  <ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" transform="rotate(${rot.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})" fill="${color}" fill-opacity="0.33" stroke="${color}" stroke-width="2"/>`;
    if (pipeline) {
      svg += `\n  <text x="${(cx + rx + 6).toFixed(2)}" y="${(cy - ry).toFixed(2)}" fill="${color}" font-family="monospace" font-size="11">${pipeline.code}</text>`;
    }
  });

  svg += `\n</svg>`;
  return svg;
}

export function downloadSectionSVG(
  pipelines: Pipeline[],
  position: number,
  axis: 'x' | 'y' | 'z',
  filename?: string,
): void {
  const svg = exportSectionSVG(pipelines, position, axis);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    filename || `管廊剖面图_${axis.toUpperCase()}_${position.toFixed(2)}m_${Date.now()}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
