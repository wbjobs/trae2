import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { Measurement } from '../../types';

interface DistanceMeasurementProps {
  start: [number, number, number];
  end: [number, number, number];
  color?: string;
  showLabel?: boolean;
}

export function DistanceMeasurement({
  start,
  end,
  color = '#00CED1',
  showLabel = true,
}: DistanceMeasurementProps) {
  const lineRef = useRef<THREE.Line>(null);
  const startSphereRef = useRef<THREE.Mesh>(null);
  const endSphereRef = useRef<THREE.Mesh>(null);

  const lineGeometry = useMemo(() => {
    const points = [
      new THREE.Vector3(...start),
      new THREE.Vector3(...end),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [start, end]);

  const distance = useMemo(() => {
    return calculateDistance(start, end);
  }, [start, end]);

  const midPoint = useMemo(
    (): [number, number, number] => [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      (start[2] + end[2]) / 2 + 3,
    ],
    [start, end]
  );

  return (
    <group>
      <lineSegments ref={lineRef as any} geometry={lineGeometry}>
        <lineBasicMaterial color={color} linewidth={3} />
      </lineSegments>

      <mesh ref={startSphereRef} position={start}>
        <sphereGeometry args={[1.2, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <mesh ref={endSphereRef} position={end}>
        <sphereGeometry args={[1.2, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {showLabel && (
        <group position={midPoint}>
          <mesh>
            <planeGeometry args={[25, 10]} />
            <meshBasicMaterial color="#1a1a2e" transparent opacity={0.95} />
          </mesh>
        </group>
      )}
    </group>
  );
}

interface AngleMeasurementProps {
  points: [[number, number, number], [number, number, number], [number, number, number]];
  color?: string;
  showLabel?: boolean;
}

export function AngleMeasurement({
  points,
  color = '#FF6B6B',
  showLabel = true,
}: AngleMeasurementProps) {
  const [p1, p2, p3] = points;

  const angle = useMemo(() => {
    return calculateAngle(p1, p2, p3);
  }, [p1, p2, p3]);

  const arcGeometry = useMemo(() => {
    const v1 = new THREE.Vector3(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]).normalize();
    const v2 = new THREE.Vector3(p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]).normalize();
    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
    
    const angleRad = (angle * Math.PI) / 180;
    const arcPoints: THREE.Vector3[] = [];
    const radius = 8;
    
    if (normal.length() > 0.001) {
      for (let i = 0; i <= 32; i++) {
        const t = (i / 32) * angleRad;
        const quaternion = new THREE.Quaternion().setFromAxisAngle(normal, t);
        const point = v1.clone().applyQuaternion(quaternion).multiplyScalar(radius);
        arcPoints.push(new THREE.Vector3(p2[0] + point.x, p2[1] + point.y, p2[2] + point.z));
      }
    }
    
    const geo = new THREE.BufferGeometry().setFromPoints(arcPoints);
    return geo;
  }, [p1, p2, p3, angle]);

  const line1Geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(...p1),
      new THREE.Vector3(...p2),
    ];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [p1, p2]);

  const line2Geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(...p2),
      new THREE.Vector3(...p3),
    ];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [p2, p3]);

  const labelPosition = useMemo((): [number, number, number] => {
    const v1 = new THREE.Vector3(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]).normalize();
    const v2 = new THREE.Vector3(p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]).normalize();
    const midDir = v1.add(v2).normalize();
    const dist = 15;
    return [
      p2[0] + midDir.x * dist,
      p2[1] + midDir.y * dist,
      p2[2] + midDir.z * dist + 2,
    ];
  }, [p1, p2, p3]);

  return (
    <group>
      <lineSegments geometry={line1Geometry}>
        <lineBasicMaterial color={color} linewidth={2} />
      </lineSegments>
      <lineSegments geometry={line2Geometry}>
        <lineBasicMaterial color={color} linewidth={2} />
      </lineSegments>
      {arcGeometry.attributes.position && arcGeometry.attributes.position.count > 0 && (
        <lineSegments geometry={arcGeometry}>
          <lineBasicMaterial color={color} linewidth={3} />
        </lineSegments>
      )}

      {[p1, p2, p3].map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[1.2, 16, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}

      {showLabel && (
        <group position={labelPosition}>
          <mesh>
            <planeGeometry args={[30, 10]} />
            <meshBasicMaterial color="#1a1a2e" transparent opacity={0.95} />
          </mesh>
        </group>
      )}
    </group>
  );
}

interface HeightMeasurementProps {
  start: [number, number, number];
  end: [number, number, number];
  color?: string;
  showLabel?: boolean;
}

export function HeightMeasurement({
  start,
  end,
  color = '#4ECDC4',
  showLabel = true,
}: HeightMeasurementProps) {
  const height = calculateHeightDifference(start, end);

  const verticalLineGeometry = useMemo(() => {
    const points = [
      new THREE.Vector3(start[0], start[1], Math.min(start[2], end[2])),
      new THREE.Vector3(start[0], start[1], Math.max(start[2], end[2])),
    ];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [start, end]);

  const horizontalLine1Geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(start[0] - 6, start[1], start[2]),
      new THREE.Vector3(start[0] + 6, start[1], start[2]),
    ];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [start]);

  const horizontalLine2Geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(end[0] - 6, end[1], end[2]),
      new THREE.Vector3(end[0] + 6, end[1], end[2]),
    ];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [end]);

  const labelPosition = useMemo(
    (): [number, number, number] => [
      start[0] + 8,
      start[1],
      (start[2] + end[2]) / 2,
    ],
    [start, end]
  );

  return (
    <group>
      <lineSegments geometry={verticalLineGeometry}>
        <lineBasicMaterial color={color} linewidth={3} />
      </lineSegments>
      <lineSegments geometry={horizontalLine1Geometry}>
        <lineBasicMaterial color={color} linewidth={2} />
      </lineSegments>
      <lineSegments geometry={horizontalLine2Geometry}>
        <lineBasicMaterial color={color} linewidth={2} />
      </lineSegments>

      <mesh position={start}>
        <sphereGeometry args={[1.2, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={end}>
        <sphereGeometry args={[1.2, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {showLabel && (
        <group position={labelPosition}>
          <mesh>
            <planeGeometry args={[25, 10]} />
            <meshBasicMaterial color="#1a1a2e" transparent opacity={0.95} />
          </mesh>
        </group>
      )}
    </group>
  );
}

interface PointMarkerProps {
  position: [number, number, number];
  label?: string;
  color?: string;
  showLabel?: boolean;
}

export function PointMarker({
  position,
  label,
  color = '#FFE66D',
  showLabel = false,
}: PointMarkerProps) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[1.5, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0, 4]} rotation={[0, 0, 0]}>
        <ringGeometry args={[2, 2.5, 32]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
      {showLabel && label && (
        <group position={[0, 0, 8]}>
          <mesh>
            <planeGeometry args={[20, 8]} />
            <meshBasicMaterial color="#1a1a2e" transparent opacity={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}

interface MeasurementDisplayProps {
  measurements: Measurement[];
}

export function MeasurementGroup({ measurements }: MeasurementDisplayProps) {
  return (
    <group>
      {measurements.map((m) => {
        if (m.type === 'distance' && m.points.length >= 2) {
          return (
            <DistanceMeasurement
              key={m.id}
              start={m.points[0]}
              end={m.points[1]}
            />
          );
        }
        if (m.type === 'angle' && m.points.length >= 3) {
          return (
            <AngleMeasurement
              key={m.id}
              points={[m.points[0], m.points[1], m.points[2]]}
            />
          );
        }
        if (m.type === 'height' && m.points.length >= 2) {
          return (
            <HeightMeasurement
              key={m.id}
              start={m.points[0]}
              end={m.points[1]}
            />
          );
        }
        return null;
      })}
    </group>
  );
}

export function calculateDistance(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function calculateAngle(
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number]
): number {
  const v1 = new THREE.Vector3(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]);
  const v2 = new THREE.Vector3(p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]);
  
  if (v1.length() < 0.001 || v2.length() < 0.001) {
    return 0;
  }
  
  v1.normalize();
  v2.normalize();
  
  const dot = v1.dot(v2);
  const clampedDot = Math.max(-1, Math.min(1, dot));
  const angleRad = Math.acos(clampedDot);
  return (angleRad * 180) / Math.PI;
}

export function calculateHeightDifference(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  return Math.abs(p2[2] - p1[2]);
}

export function calculateHorizontalDistance(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function calculateSlope(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  const horizontalDist = calculateHorizontalDistance(p1, p2);
  const heightDiff = p2[2] - p1[2];
  
  if (horizontalDist < 0.001) {
    return heightDiff > 0 ? 90 : heightDiff < 0 ? -90 : 0;
  }
  
  const slopeRad = Math.atan2(heightDiff, horizontalDist);
  return (slopeRad * 180) / Math.PI;
}

export function calculateArea(polygon: [number, number, number][]): number {
  if (polygon.length < 3) return 0;
  
  let area = 0;
  const n = polygon.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = polygon[i];
    const p2 = polygon[j];
    area += p1[0] * p2[1] - p2[0] * p1[1];
  }
  
  return Math.abs(area) / 2;
}
