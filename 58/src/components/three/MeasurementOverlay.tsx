import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import { useScene } from '@/store/scene';
import { midpoint, cylinderToCylinderSurfaceDistance } from '@/utils/vector';
import type { Vec3 } from '@shared/types';
import * as THREE from 'three';

export default function MeasurementOverlay() {
  const points = useScene((s) => s.measurePoints);
  const annotations = useScene((s) => s.annotations);
  const tool = useScene((s) => s.tool);
  const pipelines = useScene((s) => s.pipelines);
  const selectedId = useScene((s) => s.selectedId);
  const hoveredId = useScene((s) => s.hoveredId);

  const smartMeasure = useMemo(() => {
    if (tool !== 'measure' || points.length !== 2) return null;
    const a = points[0];
    const b = points[1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return {
      distance: len,
      mid: midpoint(a, b) as Vec3,
      horizontal: Math.sqrt(dx * dx + dz * dz),
      vertical: Math.abs(dy),
      pointA: a,
      pointB: b,
    };
  }, [points, tool]);

  const selectedToHovered = useMemo(() => {
    if (tool !== 'select' || !selectedId || !hoveredId || selectedId === hoveredId) return null;
    const pa = pipelines.find((p) => p.id === selectedId);
    const pb = pipelines.find((p) => p.id === hoveredId);
    if (!pa || !pb) return null;
    const res = cylinderToCylinderSurfaceDistance(
      { start: pa.startPoint, end: pa.endPoint, radius: pa.diameter / 2000 },
      { start: pb.startPoint, end: pb.endPoint, radius: pb.diameter / 2000 },
    );
    return {
      distance: res.distance,
      mid: midpoint(res.pointA, res.pointB) as Vec3,
      pointA: res.pointA,
      pointB: res.pointB,
    };
  }, [selectedId, hoveredId, pipelines, tool]);

  return (
    <group>
      {points.map((p, i) => (
        <mesh key={`m${i}`} position={p}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial color="#00d4ff" />
        </mesh>
      ))}

      {smartMeasure && (
        <group>
          <LineSegment
            start={smartMeasure.pointA}
            end={smartMeasure.pointB}
            color="#00d4ff"
          />
          <group position={smartMeasure.mid}>
            <Html distanceFactor={12} position={[0, 0.3, 0]} center>
              <div className="px-3 py-1.5 text-xs font-mono rounded bg-base-900/90 border border-accent-cyan/60 text-accent-cyan shadow-glow whitespace-nowrap">
                <div className="font-semibold">
                  距离: {smartMeasure.distance.toFixed(3)} m
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  水平 {smartMeasure.horizontal.toFixed(3)}m · 竖直 {smartMeasure.vertical.toFixed(3)}m
                </div>
              </div>
            </Html>
          </group>
        </group>
      )}

      {selectedToHovered && (
        <group>
          <mesh position={selectedToHovered.pointA}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color="#22d3a1" />
          </mesh>
          <mesh position={selectedToHovered.pointB}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color="#22d3a1" />
          </mesh>
          <LineSegment
            start={selectedToHovered.pointA}
            end={selectedToHovered.pointB}
            color="#22d3a1"
          />
          <group position={selectedToHovered.mid}>
            <Html distanceFactor={14} position={[0, 0.25, 0]} center>
              <div className="px-2 py-1 text-xs font-mono rounded bg-base-900/90 border border-accent-success/60 text-accent-success shadow-glow whitespace-nowrap">
                净距: {selectedToHovered.distance.toFixed(3)} m
              </div>
            </Html>
          </group>
        </group>
      )}

      {annotations.map((a) => {
        if (a.points.length < 2) return null;
        const mid = midpoint(a.points[0], a.points[1]) as Vec3;
        return (
          <group key={a.id}>
            <LineSegment
              start={a.points[0]}
              end={a.points[1]}
              color="#ff8a00"
            />
            <mesh position={a.points[0]}>
              <sphereGeometry args={[0.04, 10, 10]} />
              <meshBasicMaterial color="#ff8a00" />
            </mesh>
            <mesh position={a.points[1]}>
              <sphereGeometry args={[0.04, 10, 10]} />
              <meshBasicMaterial color="#ff8a00" />
            </mesh>
            <group position={mid}>
              <Html distanceFactor={14} position={[0, 0.3, 0]} center>
                <div className="px-2 py-1 text-xs font-mono rounded bg-base-900/85 border border-accent-orange/60 text-accent-orange whitespace-nowrap">
                  {a.label || `${a.value.toFixed(3)} ${a.unit}`}
                </div>
              </Html>
            </group>
          </group>
        );
      })}
    </group>
  );
}

function LineSegment({ start, end, color }: { start: Vec3; end: Vec3; color: string }) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array([...start, ...end]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [start, end]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} linewidth={1} />
    </lineSegments>
  );
}
