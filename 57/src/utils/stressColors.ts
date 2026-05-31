import * as THREE from 'three';

export function getStressColor(stress: number, minStress: number, maxStress: number): THREE.Color {
  if (maxStress <= minStress) return new THREE.Color('#22C55E');
  const normalized = (stress - minStress) / (maxStress - minStress);
  const clamped = Math.max(0, Math.min(1, normalized));
  
  const hue = (1 - clamped) * 0.65;
  const color = new THREE.Color().setHSL(hue, 0.9, 0.5);
  return color;
}

export function getStressColorHex(stress: number, minStress: number, maxStress: number): string {
  const color = getStressColor(stress, minStress, maxStress);
  return '#' + color.getHexString();
}

export function calculateStressAtPosition(position: THREE.Vector3, stressResults: StressResult[]): number {
  if (stressResults.length === 0) return 50;
  
  const baseStress = stressResults[0];
  const distance = Math.sqrt(position.x * position.x + position.z * position.z);
  const heightFactor = Math.max(0, position.y / 10);
  const distanceFactor = Math.min(1, distance / 15);
  
  const stress = baseStress.minStress + 
    (baseStress.maxStress - baseStress.minStress) * (0.3 + distanceFactor * 0.4 + heightFactor * 0.3);
  
  return stress;
}

interface StressResult {
  id: string;
  bridgeId: string;
  elementId: string;
  maxStress: number;
  minStress: number;
  stressDistribution: string;
  analysisDate: string;
}

export function createStressTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * 4);
  
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    const hue = (1 - t) * 0.65;
    const color = new THREE.Color().setHSL(hue, 0.9, 0.5);
    data[i * 4] = Math.floor(color.r * 255);
    data[i * 4 + 1] = Math.floor(color.g * 255);
    data[i * 4 + 2] = Math.floor(color.b * 255);
    data[i * 4 + 3] = 255;
  }
  
  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export const severityColors: Record<string, string> = {
  low: '#22C55E',
  medium: '#EAB308',
  high: '#F97316',
  critical: '#EF4444',
};

export const defectTypeLabels: Record<string, string> = {
  crack: '裂纹',
  corrosion: '腐蚀',
  deformation: '变形',
  spalling: '剥落',
};

export const severityLabels: Record<string, string> = {
  low: '轻微',
  medium: '中等',
  high: '严重',
  critical: '危急',
};

export const defectTypeIcons: Record<string, string> = {
  crack: '⟋',
  corrosion: '◈',
  deformation: '⟷',
  spalling: '◐',
};
