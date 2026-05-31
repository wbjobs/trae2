import type { Collision, Pipeline, Vec3 } from '../../shared/types.js';
import {
  segmentDistanceOptimized,
  quickBBoxDistance,
  computeAABB,
  aabbOverlap,
  cylinderToCylinderClearance,
} from './geometry.js';

export interface CollisionOptions {
  threshold: number;
  sectionId?: string;
  types?: string[];
  earlyExit?: boolean;
}

export function buildSpatialGrid(pipelines: Pipeline[], cellSize = 5): Map<string, Pipeline[]> {
  const grid = new Map<string, Pipeline[]>();
  pipelines.forEach((p) => {
    const aabb = computeAABB(p);
    const minCell = [
      Math.floor(aabb.min[0] / cellSize),
      Math.floor(aabb.min[1] / cellSize),
      Math.floor(aabb.min[2] / cellSize),
    ];
    const maxCell = [
      Math.floor(aabb.max[0] / cellSize),
      Math.floor(aabb.max[1] / cellSize),
      Math.floor(aabb.max[2] / cellSize),
    ];
    for (let x = minCell[0]; x <= maxCell[0]; x++) {
      for (let y = minCell[1]; y <= maxCell[1]; y++) {
        for (let z = minCell[2]; z <= maxCell[2]; z++) {
          const key = `${x},${y},${z}`;
          let cell = grid.get(key);
          if (!cell) {
            cell = [];
            grid.set(key, cell);
          }
          cell.push(p);
        }
      }
    }
  });
  return grid;
}

export function detectCollisions(
  pipelines: Pipeline[],
  threshold: number,
): Collision[];
export function detectCollisions(
  pipelines: Pipeline[],
  options: CollisionOptions,
): Collision[];
export function detectCollisions(
  pipelines: Pipeline[],
  opts: number | CollisionOptions,
): Collision[] {
  const options: CollisionOptions =
    typeof opts === 'number' ? { threshold: opts } : opts;
  const { threshold, sectionId, types, earlyExit = false } = options;

  let filtered = pipelines;
  if (sectionId) filtered = filtered.filter((p) => p.sectionId === sectionId);
  if (types?.length) filtered = filtered.filter((p) => types.includes(p.type));

  const result: Collision[] = [];
  const collisionIds = new Set<string>();

  if (filtered.length < 2) return result;

  const grid = buildSpatialGrid(filtered, 8);
  const processed = new Set<string>();

  const candidatePairs = new Map<string, [Pipeline, Pipeline]>();

  grid.forEach((cell) => {
    for (let i = 0; i < cell.length; i++) {
      for (let j = i + 1; j < cell.length; j++) {
        const pa = cell[i];
        const pb = cell[j];
        const key = pa.id < pb.id ? `${pa.id}-${pb.id}` : `${pb.id}-${pa.id}`;
        if (!candidatePairs.has(key)) {
          candidatePairs.set(key, [pa, pb]);
        }
      }
    }
  });

  for (const [pa, pb] of candidatePairs.values()) {
    const ra = pa.diameter / 2000;
    const rb = pb.diameter / 2000;
    const sumRadius = ra + rb;
    const detectThreshold = sumRadius + threshold;

    const bboxDist = quickBBoxDistance(pa, pb);
    if (bboxDist > detectThreshold + 2) continue;

    const { distance, pointA, pointB } = segmentDistanceOptimized(
      pa.startPoint,
      pa.endPoint,
      pb.startPoint,
      pb.endPoint,
    );

    if (distance < detectThreshold) {
      const center: Vec3 = [
        (pointA[0] + pointB[0]) / 2,
        (pointA[1] + pointB[1]) / 2,
        (pointA[2] + pointB[2]) / 2,
      ];

      const level: 'danger' | 'warning' = distance < sumRadius - 0.001 ? 'danger' : 'warning';
      const clearance = distance - sumRadius;

      const id = `c-${pa.id}-${pb.id}`;
      if (collisionIds.has(id)) continue;
      collisionIds.add(id);

      result.push({
        id,
        a: pa.id,
        b: pb.id,
        point: center,
        distance: Math.max(0, Math.round(clearance * 1000) / 1000),
        level,
      });

      if (earlyExit && result.length >= 100) break;
    }
  }

  return result.sort((a, b) => a.distance - b.distance);
}

export function detectSinglePair(pa: Pipeline, pb: Pipeline): Collision | null {
  const ra = pa.diameter / 2000;
  const rb = pb.diameter / 2000;
  const sumRadius = ra + rb;

  const { distance, pointA, pointB } = segmentDistanceOptimized(
    pa.startPoint,
    pa.endPoint,
    pb.startPoint,
    pb.endPoint,
  );

  if (distance < sumRadius) {
    const center: Vec3 = [
      (pointA[0] + pointB[0]) / 2,
      (pointA[1] + pointB[1]) / 2,
      (pointA[2] + pointB[2]) / 2,
    ];
    const clearance = distance - sumRadius;
    const level: 'danger' | 'warning' = distance < sumRadius - 0.001 ? 'danger' : 'warning';
    return {
      id: `c-${pa.id}-${pb.id}`,
      a: pa.id,
      b: pb.id,
      point: center,
      distance: Math.max(0, Math.round(clearance * 1000) / 1000),
      level,
    };
  }
  return null;
}

export function getNearbyPipelines(
  pipeline: Pipeline,
  allPipelines: Pipeline[],
  maxDist: number,
): Array<{ pipeline: Pipeline; distance: number }> {
  const results: Array<{ pipeline: Pipeline; distance: number }> = [];
  const aabb = computeAABB(pipeline);

  for (const other of allPipelines) {
    if (other.id === pipeline.id) continue;
    const otherAABB = computeAABB(other);
    if (!aabbOverlap(aabb, otherAABB, maxDist)) {
      const { clearance } = cylinderToCylinderClearance(pipeline, other);
      if (clearance < maxDist) {
        results.push({ pipeline: other, distance: clearance });
      }
    }
  }
  return results.sort((a, b) => a.distance - b.distance);
}

export function computePipelineClearanceMatrix(
  pipelines: Pipeline[],
): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();
  for (const pa of pipelines) {
    const row = new Map<string, number>();
    for (const pb of pipelines) {
      if (pa.id === pb.id) {
        row.set(pb.id, 0);
        continue;
      }
      const { clearance } = cylinderToCylinderClearance(pa, pb);
      row.set(pb.id, Math.round(clearance * 1000) / 1000);
    }
    matrix.set(pa.id, row);
  }
  return matrix;
}
