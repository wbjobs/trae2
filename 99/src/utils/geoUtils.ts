import proj4 from 'proj4';
import * as THREE from 'three';
import type { Borehole } from '@/types';

proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

const EARTH_RADIUS = 6378137;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface SceneParams {
  centerLon: number;
  centerLat: number;
  scale: number;
  verticalExaggeration: number;
}

export function lonLatToWebMercator(lon: number, lat: number): [number, number] {
  const result = proj4('EPSG:4326', 'EPSG:3857', [lon, lat]);
  return result as [number, number];
}

export function webMercatorToLonLat(x: number, y: number): [number, number] {
  const result = proj4('EPSG:3857', 'EPSG:4326', [x, y]);
  return result as [number, number];
}

export function calculateSceneCenter(boreholes: Borehole[]): [number, number] {
  if (boreholes.length === 0) {
    return [116.397, 39.908];
  }
  const sumLon = boreholes.reduce((sum, b) => sum + b.longitude, 0);
  const sumLat = boreholes.reduce((sum, b) => sum + b.latitude, 0);
  return [sumLon / boreholes.length, sumLat / boreholes.length];
}

export function lonLatToSceneCoord(
  lon: number,
  lat: number,
  elevation: number,
  sceneParams: SceneParams
): [number, number, number] {
  const { centerLon, centerLat, scale, verticalExaggeration } = sceneParams;

  const [centerX, centerY] = lonLatToWebMercator(centerLon, centerLat);
  const [pointX, pointY] = lonLatToWebMercator(lon, lat);

  const x = (pointX - centerX) / scale;
  const z = (pointY - centerY) / scale;
  const y = elevation * verticalExaggeration;

  return [x, y, z];
}

export function sceneCoordToLonLat(
  x: number,
  y: number,
  z: number,
  sceneParams: SceneParams
): [number, number, number] {
  const { centerLon, centerLat, scale, verticalExaggeration } = sceneParams;

  const [centerX, centerY] = lonLatToWebMercator(centerLon, centerLat);
  const mercatorX = x * scale + centerX;
  const mercatorY = z * scale + centerY;

  const [lon, lat] = webMercatorToLonLat(mercatorX, mercatorY);
  const elevation = y / verticalExaggeration;

  return [lon, lat, elevation];
}

export function calculatePolygonArea(coordinates: [number, number][]): number {
  if (coordinates.length < 3) return 0;

  let area = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x1, y1] = coordinates[i];
    const [x2, y2] = coordinates[j];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2;
}

export function distance3D(p1: [number, number, number], p2: [number, number, number]): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distance2D(p1: [number, number], p2: [number, number]): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function haversineDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

export function pointToPlaneDistance(
  point: [number, number, number],
  planePoint1: [number, number, number],
  planePoint2: [number, number, number],
  planePoint3: [number, number, number]
): number {
  const v1 = new THREE.Vector3(
    planePoint2[0] - planePoint1[0],
    planePoint2[1] - planePoint1[1],
    planePoint2[2] - planePoint1[2]
  );
  const v2 = new THREE.Vector3(
    planePoint3[0] - planePoint1[0],
    planePoint3[1] - planePoint1[1],
    planePoint3[2] - planePoint1[2]
  );
  const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    normal,
    new THREE.Vector3(planePoint1[0], planePoint1[1], planePoint1[2])
  );
  const pointVec = new THREE.Vector3(point[0], point[1], point[2]);
  return Math.abs(plane.distanceToPoint(pointVec));
}

export interface IDWPoint {
  x: number;
  y: number;
  value: number;
}

export function idwInterpolate(
  points: IDWPoint[],
  x: number,
  y: number,
  power: number = 2
): number {
  if (points.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const point of points) {
    const dist = distance2D([x, y], [point.x, point.y]);
    if (dist < 0.0001) {
      return point.value;
    }
    const weight = 1 / Math.pow(dist, power);
    weightedSum += weight * point.value;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export interface KrigingPoint {
  x: number;
  y: number;
  value: number;
}

export function simpleKriging(
  points: KrigingPoint[],
  x: number,
  y: number,
  range: number = 1000,
  sill: number = 1,
  nugget: number = 0
): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].value;

  const n = points.length;
  const distances: number[][] = [];

  for (let i = 0; i < n; i++) {
    distances[i] = [];
    for (let j = 0; j < n; j++) {
      const dist = distance2D([points[i].x, points[i].y], [points[j].x, points[j].y]);
      distances[i][j] = sphericalVariogram(dist, range, sill, nugget);
    }
  }

  const targetDistances: number[] = [];
  for (let i = 0; i < n; i++) {
    const dist = distance2D([x, y], [points[i].x, points[i].y]);
    targetDistances[i] = sphericalVariogram(dist, range, sill, nugget);
  }

  const meanValue = points.reduce((sum, p) => sum + p.value, 0) / n;
  const deviations = points.map(p => p.value - meanValue);

  const weights = solveKrigingSystem(distances, targetDistances);

  let estimate = meanValue;
  for (let i = 0; i < n; i++) {
    estimate += weights[i] * deviations[i];
  }

  return estimate;
}

function sphericalVariogram(h: number, range: number, sill: number, nugget: number): number {
  if (h === 0) return 0;
  if (h >= range) return sill;
  const hr = h / range;
  return nugget + (sill - nugget) * (1.5 * hr - 0.5 * hr * hr * hr);
}

function solveKrigingSystem(matrix: number[][], vector: number[]): number[] {
  const n = matrix.length;
  const augmented: number[][] = [];

  for (let i = 0; i < n; i++) {
    augmented[i] = [...matrix[i], vector[i]];
  }

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
        maxRow = row;
      }
    }

    [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

    const pivot = augmented[col][col];
    if (Math.abs(pivot) < 1e-10) {
      return new Array(n).fill(1 / n);
    }

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = augmented[row][col] / pivot;
        for (let j = col; j <= n; j++) {
          augmented[row][j] -= factor * augmented[col][j];
        }
      }
    }
  }

  const solution: number[] = [];
  for (let i = 0; i < n; i++) {
    solution[i] = augmented[i][n] / augmented[i][i];
  }

  return solution;
}

export function getElevationColor(elevation: number, minElev: number, maxElev: number): string {
  const colors = [
    { stop: 0.0, color: [30, 120, 200] },
    { stop: 0.25, color: [50, 180, 100] },
    { stop: 0.5, color: [220, 210, 80] },
    { stop: 0.75, color: [160, 100, 50] },
    { stop: 1.0, color: [255, 255, 255] },
  ];

  const t = Math.max(0, Math.min(1, (elevation - minElev) / (maxElev - minElev)));

  for (let i = 0; i < colors.length - 1; i++) {
    if (t >= colors[i].stop && t <= colors[i + 1].stop) {
      const range = colors[i + 1].stop - colors[i].stop;
      const localT = (t - colors[i].stop) / range;
      const r = Math.round(colors[i].color[0] + (colors[i + 1].color[0] - colors[i].color[0]) * localT);
      const g = Math.round(colors[i].color[1] + (colors[i + 1].color[1] - colors[i].color[1]) * localT);
      const b = Math.round(colors[i].color[2] + (colors[i + 1].color[2] - colors[i].color[2]) * localT);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  return 'rgb(255, 255, 255)';
}

export function getElevationColorThree(elevation: number, minElev: number, maxElev: number): THREE.Color {
  const colors = [
    { stop: 0.0, color: new THREE.Color(0x1e78c8) },
    { stop: 0.25, color: new THREE.Color(0x32b464) },
    { stop: 0.5, color: new THREE.Color(0xdcd250) },
    { stop: 0.75, color: new THREE.Color(0xa06432) },
    { stop: 1.0, color: new THREE.Color(0xffffff) },
  ];

  const t = Math.max(0, Math.min(1, (elevation - minElev) / (maxElev - minElev)));

  for (let i = 0; i < colors.length - 1; i++) {
    if (t >= colors[i].stop && t <= colors[i + 1].stop) {
      const range = colors[i + 1].stop - colors[i].stop;
      const localT = (t - colors[i].stop) / range;
      return colors[i].color.clone().lerp(colors[i + 1].color, localT);
    }
  }

  return new THREE.Color(0xffffff);
}
