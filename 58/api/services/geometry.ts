import type { Pipeline, Vec3 } from '../../shared/types.js';

export function dist(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function length(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function pointToSegmentDistance(p: Vec3, a0: Vec3, a1: Vec3): { distance: number; point: Vec3; t: number } {
  const ab = sub(a1, a0);
  const ap = sub(p, a0);
  const abLen2 = dot(ab, ab);
  if (abLen2 < 1e-12) {
    return { distance: dist(p, a0), point: a0, t: 0 };
  }
  let t = dot(ap, ab) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const proj = add(a0, scale(ab, t));
  return { distance: dist(p, proj), point: proj, t };
}

export function segmentDistanceOptimized(
  a0: Vec3,
  a1: Vec3,
  b0: Vec3,
  b1: Vec3,
): { distance: number; pointA: Vec3; pointB: Vec3 } {
  const EPS = 1e-8;
  const u = sub(a1, a0);
  const v = sub(b1, b0);
  const w = sub(a0, b0);
  const a = dot(u, u);
  const b = dot(u, v);
  const c = dot(v, v);
  const d = dot(u, w);
  const e = dot(v, w);
  const denom = a * c - b * b;

  let s = 0;
  let t = 0;

  if (denom > EPS) {
    s = (b * e - c * d) / denom;
    t = (a * e - b * d) / denom;
    s = Math.max(0, Math.min(1, s));
    t = Math.max(0, Math.min(1, t));
  } else {
    const lenA = length(u);
    const lenB = length(v);
    if (lenA < 1e-6 && lenB < 1e-6) {
      s = 0;
      t = 0;
    } else if (lenA < 1e-6) {
      s = 0;
      const res = pointToSegmentDistance(a0, b0, b1);
      t = res.t;
    } else if (lenB < 1e-6) {
      t = 0;
      const res = pointToSegmentDistance(b0, a0, a1);
      s = res.t;
    } else {
      const sampleCount = 20;
      let bestDist = Infinity;
      let bestS = 0;
      let bestT = 0;
      for (let si = 0; si <= sampleCount; si++) {
        const sVal = si / sampleCount;
        const pa: Vec3 = [a0[0] + sVal * u[0], a0[1] + sVal * u[1], a0[2] + sVal * u[2]];
        const res = pointToSegmentDistance(pa, b0, b1);
        if (res.distance < bestDist) {
          bestDist = res.distance;
          bestS = sVal;
          bestT = res.t;
        }
      }
      s = bestS;
      t = bestT;
    }
  }

  const pointA: Vec3 = [a0[0] + s * u[0], a0[1] + s * u[1], a0[2] + s * u[2]];
  const pointB: Vec3 = [b0[0] + t * v[0], b0[1] + t * v[1], b0[2] + t * v[2]];

  const finalDist = dist(pointA, pointB);

  if (finalDist < 1e-4) {
    return { distance: 0, pointA, pointB };
  }

  return { distance: finalDist, pointA, pointB };
}

export function quickBBoxDistance(pa: Pipeline, pb: Pipeline): number {
  const minA: Vec3 = [
    Math.min(pa.startPoint[0], pa.endPoint[0]),
    Math.min(pa.startPoint[1], pa.endPoint[1]),
    Math.min(pa.startPoint[2], pa.endPoint[2]),
  ];
  const maxA: Vec3 = [
    Math.max(pa.startPoint[0], pa.endPoint[0]),
    Math.max(pa.startPoint[1], pa.endPoint[1]),
    Math.max(pa.startPoint[2], pa.endPoint[2]),
  ];
  const minB: Vec3 = [
    Math.min(pb.startPoint[0], pb.endPoint[0]),
    Math.min(pb.startPoint[1], pb.endPoint[1]),
    Math.min(pb.startPoint[2], pb.endPoint[2]),
  ];
  const maxB: Vec3 = [
    Math.max(pb.startPoint[0], pb.endPoint[0]),
    Math.max(pb.startPoint[1], pb.endPoint[1]),
    Math.max(pb.startPoint[2], pb.endPoint[2]),
  ];

  let d2 = 0;
  for (let k = 0; k < 3; k++) {
    if (maxA[k] < minB[k]) d2 += (minB[k] - maxA[k]) ** 2;
    else if (minA[k] > maxB[k]) d2 += (minA[k] - maxB[k]) ** 2;
  }
  return Math.sqrt(d2);
}

export interface AABB {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  radius: number;
}

export function computeAABB(p: Pipeline): AABB {
  const min: Vec3 = [
    Math.min(p.startPoint[0], p.endPoint[0]),
    Math.min(p.startPoint[1], p.endPoint[1]),
    Math.min(p.startPoint[2], p.endPoint[2]),
  ];
  const max: Vec3 = [
    Math.max(p.startPoint[0], p.endPoint[0]),
    Math.max(p.startPoint[1], p.endPoint[1]),
    Math.max(p.startPoint[2], p.endPoint[2]),
  ];
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = dist(min, max) / 2;
  return { min, max, center, radius };
}

export function aabbOverlap(a: AABB, b: AABB, padding = 0): boolean {
  return (
    a.min[0] - padding <= b.max[0] &&
    a.max[0] + padding >= b.min[0] &&
    a.min[1] - padding <= b.max[1] &&
    a.max[1] + padding >= b.min[1] &&
    a.min[2] - padding <= b.max[2] &&
    a.max[2] + padding >= b.min[2]
  );
}

export function cylinderToCylinderClearance(
  pa: Pipeline,
  pb: Pipeline,
): { distance: number; pointA: Vec3; pointB: Vec3; clearance: number } {
  const ra = pa.diameter / 2000;
  const rb = pb.diameter / 2000;
  const res = segmentDistanceOptimized(pa.startPoint, pa.endPoint, pb.startPoint, pb.endPoint);
  const clearance = res.distance - ra - rb;
  return { ...res, clearance };
}
