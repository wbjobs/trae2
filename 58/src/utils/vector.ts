import type { Vec3 } from '@shared/types';

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
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

export function rotationFromTo(from: Vec3, to: Vec3): { axis: Vec3; angle: number } {
  const f = normalize(from);
  const t = normalize(to);
  const d = Math.max(-1, Math.min(1, dot(f, t)));
  const angle = Math.acos(d);
  const c = cross(f, t);
  const len = length(c);
  if (len < 1e-6) {
    return { axis: [0, 1, 0], angle };
  }
  return { axis: [c[0] / len, c[1] / len, c[2] / len], angle };
}

export function pointToSegmentDistance(
  p: Vec3,
  a0: Vec3,
  a1: Vec3,
): { distance: number; point: Vec3; t: number } {
  const ab = sub(a1, a0);
  const ap = sub(p, a0);
  const abLen2 = dot(ab, ab);
  if (abLen2 < 1e-12) {
    return { distance: distance(p, a0), point: a0, t: 0 };
  }
  let t = dot(ap, ab) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const proj = add(a0, scale(ab, t));
  return { distance: distance(p, proj), point: proj, t };
}

export function segmentToSegmentDistance(
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
      const sampleCount = 30;
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
  const finalDist = distance(pointA, pointB);

  return { distance: Math.max(0, finalDist), pointA, pointB };
}

export interface Cylinder {
  start: Vec3;
  end: Vec3;
  radius: number;
}

export function cylinderToCylinderSurfaceDistance(
  cylA: Cylinder,
  cylB: Cylinder,
): { distance: number; pointA: Vec3; pointB: Vec3 } {
  const { distance: axisDist, pointA: axisA, pointB: axisB } = segmentToSegmentDistance(
    cylA.start,
    cylA.end,
    cylB.start,
    cylB.end,
  );

  const dirAB = sub(axisB, axisA);
  const len = length(dirAB);

  if (len < 1e-6) {
    const dir = normalize(sub(cylA.end, cylA.start));
    const perp = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const n = normalize(cross(dir, perp as Vec3));
    const pointA = add(axisA, scale(n, cylA.radius));
    const pointB = add(axisB, scale(n, -cylB.radius));
    return {
      distance: Math.max(0, axisDist - cylA.radius - cylB.radius),
      pointA,
      pointB,
    };
  }

  const n = scale(dirAB, 1 / len);
  const pointA = add(axisA, scale(n, cylA.radius));
  const pointB = sub(axisB, scale(n, cylB.radius));
  return {
    distance: Math.max(0, axisDist - cylA.radius - cylB.radius),
    pointA,
    pointB,
  };
}

export function projectPointToCylinderSurface(
  point: Vec3,
  cyl: Cylinder,
): Vec3 {
  const { point: axisPoint } = pointToSegmentDistance(point, cyl.start, cyl.end);
  const dir = sub(point, axisPoint);
  const len = length(dir);
  if (len < 1e-6) {
    const axisDir = normalize(sub(cyl.end, cyl.start));
    const perp = Math.abs(axisDir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const n = normalize(cross(axisDir, perp as Vec3));
    return add(axisPoint, scale(n, cyl.radius));
  }
  const n = scale(dir, 1 / len);
  return add(axisPoint, scale(n, cyl.radius));
}
