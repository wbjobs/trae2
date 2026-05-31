import * as THREE from 'three';
import { SectionPlane, TerrainData, GeologyLayer } from '../types';
import { generateGeologyLayerDepths } from './mockData';

export interface ExportSectionOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  includeLegend?: boolean;
  includeScale?: boolean;
  format?: 'png' | 'jpg' | 'svg';
}

export interface SectionProfileData {
  xAxis: number[];
  terrainHeights: number[];
  layerBoundaries: { name: string; color: string; depths: number[] }[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function generateSectionProfile(
  plane: SectionPlane,
  terrainData: TerrainData,
  geologyLayers: GeologyLayer[],
  numSamples: number = 200
): SectionProfileData {
  const { bounds, demData, resolution } = terrainData;

  const normal = new THREE.Vector3(...plane.normal).normalize();
  const origin = new THREE.Vector3(...plane.origin);

  const tangent1 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);

  if (Math.abs(normal.z) < 0.9) {
    tangent1.set(1, 0, 0);
  } else {
    tangent1.crossVectors(up, normal).normalize();
  }

  tangent1.crossVectors(up, normal).normalize();

  const halfWidth = (bounds.maxX - bounds.minX) / 2;
  const halfHeight = (bounds.maxY - bounds.minY) / 2;
  const sampleRadius = Math.max(halfWidth, halfHeight) * 1.5;

  const xAxis: number[] = [];
  const terrainHeights: number[] = [];
  const layerBoundaries = geologyLayers.map(layer => ({
    name: layer.name,
    color: layer.color,
    depths: [] as number[]
  }));

  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < numSamples; i++) {
    const t = (i / numSamples - 0.5) * 2 * sampleRadius;

    const point = origin.clone().addScaledVector(tangent1, t);

    const gridX = Math.floor(
      ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * resolution
    );
    const gridY = Math.floor(
      ((point.y - bounds.minY) / (bounds.maxY - bounds.minY)) * resolution
    );

    xAxis.push(t);

    if (gridX >= 0 && gridX < resolution && gridY >= 0 && gridY < resolution) {
      const terrainHeight = demData[gridY]?.[gridX] ?? 0;
      terrainHeights.push(terrainHeight);

      geologyLayers.forEach((layer, index) => {
        const layerDepths = generateGeologyLayerDepths(resolution, layer.depth, 3);
        const layerDepthVal = layerDepths[gridY]?.[gridX] ?? layer.depth;
        const surfaceHeight = terrainHeight - layerDepthVal;
        layerBoundaries[index].depths.push(surfaceHeight);

        minZ = Math.min(minZ, surfaceHeight - layer.thickness);
        maxZ = Math.max(maxZ, terrainHeight);
      });

      minZ = Math.min(minZ, terrainHeight);
      maxZ = Math.max(maxZ, terrainHeight);
    } else {
      terrainHeights.push(0);
      layerBoundaries.forEach(lb => lb.depths.push(0));
    }
  }

  return {
    xAxis,
    terrainHeights,
    layerBoundaries,
    minX: -sampleRadius,
    maxX: sampleRadius,
    minZ: minZ - 10,
    maxZ: maxZ + 10,
  };
}

export function createSectionCanvas(
  profileData: SectionProfileData,
  options: ExportSectionOptions = {}
): HTMLCanvasElement {
  const width = options.width ?? 800;
  const height = options.height ?? 400;
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = options.backgroundColor || '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  const xRange = profileData.maxX - profileData.minX;
  const zRange = profileData.maxZ - profileData.minZ;

  const xScale = (x: number) => padding.left + ((x - profileData.minX) / xRange) * plotWidth;
  const zScale = (z: number) => padding.top + (1 - (z - profileData.minZ) / zRange) * plotHeight;

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const y = padding.top + (plotHeight / 10) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    const z = profileData.maxZ - (zRange / 10) * i;
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(z.toFixed(0), padding.left - 5, y + 3);
  }

  for (let i = 0; i <= 10; i++) {
    const x = padding.left + (plotWidth / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, height - padding.bottom);
    ctx.stroke();

    const xVal = profileData.minX + (xRange / 10) * i;
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(xVal.toFixed(0), x, height - padding.bottom + 15);
  }

  profileData.layerBoundaries.forEach((layer, index) => {
    if (index < profileData.layerBoundaries.length - 1) {
      const nextLayer = profileData.layerBoundaries[index + 1];

      ctx.beginPath();
      ctx.moveTo(
        xScale(profileData.xAxis[0]),
        zScale(layer.depths[0])
      );

      for (let i = 1; i < profileData.xAxis.length; i++) {
        ctx.lineTo(
          xScale(profileData.xAxis[i]),
          zScale(layer.depths[i])
        );
      }

      for (let i = profileData.xAxis.length - 1; i >= 0; i--) {
        ctx.lineTo(
          xScale(profileData.xAxis[i]),
          zScale(nextLayer.depths[i])
        );
      }

      ctx.closePath();
      ctx.fillStyle = layer.color + '80';
      ctx.fill();
    }
  });

  ctx.beginPath();
  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = 2;
  ctx.moveTo(
    xScale(profileData.xAxis[0]),
    zScale(profileData.terrainHeights[0])
  );

  for (let i = 1; i < profileData.xAxis.length; i++) {
    ctx.lineTo(
      xScale(profileData.xAxis[i]),
      zScale(profileData.terrainHeights[i])
    );
  }

  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('地质剖面图', width / 2, 20);

  ctx.save();
  ctx.translate(20, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('高程 (m)', 0, 0);
  ctx.restore();

  ctx.fillText('距离 (m)', width / 2, height - 20);

  if (options.includeLegend !== false) {
    const legendX = width - 120;
    const legendY = padding.top;

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('图例', legendX, legendY);

    profileData.layerBoundaries.forEach((layer, index) => {
      const y = legendY + 20 + index * 20;
      ctx.fillStyle = layer.color;
      ctx.fillRect(legendX, y - 10, 15, 15);
      ctx.strokeStyle = '#666';
      ctx.strokeRect(legendX, y - 10, 15, 15);
      ctx.fillStyle = '#ccc';
      ctx.font = '10px Arial';
      ctx.fillText(layer.name, legendX + 20, y + 2);
    });
  }

  return canvas;
}

export function exportSectionAsImage(
  profileData: SectionProfileData,
  options: ExportSectionOptions = {}
): string {
  const canvas = createSectionCanvas(profileData, options);
  const format = options.format || 'png';
  return canvas.toDataURL('image/' + format);
}

export function downloadSectionImage(
  profileData: SectionProfileData,
  filename: string = 'geology-section',
  options: ExportSectionOptions = {}
) {
  const dataUrl = exportSectionAsImage(profileData, options);
  const format = options.format || 'png';
  const link = document.createElement('a');
  link.download = filename + '.' + format;
  link.href = dataUrl;
  link.click();
}

export function exportCurrentView(
  filename: string = '3d-view',
  format: 'png' | 'jpg' = 'png'
) {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;

  const link = document.createElement('a');
  link.download = filename + '.' + format;
  link.href = canvas.toDataURL('image/' + format);
  link.click();
}

export function generateSectionReport(
  profileData: SectionProfileData,
  sectionName: string = '地质剖面报告'
): string {
  const lines: string[] = [];

  lines.push(sectionName);
  lines.push('='.repeat(40));
  lines.push('');

  lines.push('剖面范围: X: ' + profileData.minX.toFixed(2) + ' ~ ' + profileData.maxX.toFixed(2) + ' m');
  lines.push('高程范围: ' + profileData.minZ.toFixed(2) + ' ~ ' + profileData.maxZ.toFixed(2) + ' m');
  lines.push('');

  lines.push('岩层信息:');
  lines.push('-'.repeat(30));

  profileData.layerBoundaries.forEach((layer) => {
    const avgDepth = layer.depths.reduce((a, b) => a + b, 0) / layer.depths.length;
    lines.push(layer.name + ':');
    lines.push('  平均高程: ' + avgDepth.toFixed(2) + ' m');
    lines.push('  颜色: ' + layer.color);
    lines.push('');
  });

  const totalThickness = profileData.maxZ - profileData.minZ;
  lines.push('总厚度: ' + totalThickness.toFixed(2) + ' m');

  return lines.join('\n');
}

export function downloadSectionReport(
  profileData: SectionProfileData,
  filename: string = 'geology-report'
) {
  const report = generateSectionReport(profileData);
  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.download = filename + '.txt';
  link.href = URL.createObjectURL(blob);
  link.click();
}
