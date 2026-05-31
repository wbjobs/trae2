import { useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useScene } from '@/store/scene';
import { PIPELINE_TYPE_COLOR } from '@shared/types';
import type { Pipeline, Vec3 } from '@shared/types';
import * as THREE from 'three';

interface PipeMeshProps {
  pipeline: Pipeline;
}

const geomCache = new Map<string, THREE.CylinderGeometry>();

export default function PipeMesh({ pipeline }: PipeMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const selectedId = useScene((s) => s.selectedId);
  const hoveredId = useScene((s) => s.hoveredId);
  const select = useScene((s) => s.select);
  const hover = useScene((s) => s.hover);
  const tool = useScene((s) => s.tool);
  const pushMeasurePoint = useScene((s) => s.pushMeasurePoint);
  const clip = useScene((s) => s.clip);
  const style = useScene((s) => s.style);
  const frustumCulling = style.frustumCulling;
  const lodBias = style.lodBias;

  const color = PIPELINE_TYPE_COLOR[pipeline.type];
  const isSelected = selectedId === pipeline.id;
  const isHovered = hoveredId === pipeline.id;

  const { position, quaternion, length, axis } = useMemo(() => {
    const start = new THREE.Vector3(...pipeline.startPoint);
    const end = new THREE.Vector3(...pipeline.endPoint);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const len = dir.length();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const normalizedDir = dir.clone().normalize();
    q.setFromUnitVectors(up, normalizedDir);
    return {
      position: [mid.x, mid.y, mid.z] as Vec3,
      quaternion: q,
      length: len,
      axis: normalizedDir,
    };
  }, [pipeline.startPoint, pipeline.endPoint]);

  const clippingPlane = useMemo(() => {
    if (!clip.enabled) return undefined;
    const normal =
      clip.axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : clip.axis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
    if (clip.invert) normal.negate();
    return new THREE.Plane(normal, -clip.position);
  }, [clip]);

  const diameter = pipeline.diameter / 1000;
  const radialSegments = diameter < 0.15 ? 18 : diameter < 0.4 ? 28 : 36;
  const heightSegments = Math.max(2, Math.min(64, Math.ceil(length / 0.8)));

  const geometry = useMemo(() => {
    const key = `${diameter.toFixed(3)}_${length.toFixed(3)}`;
    let geom = geomCache.get(key);
    if (!geom) {
      geom = new THREE.CylinderGeometry(
        diameter / 2,
        diameter / 2,
        length,
        radialSegments,
        heightSegments,
        false,
      );
      geomCache.set(key, geom);
    }
    return geom;
  }, [diameter, length, radialSegments, heightSegments]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (tool === 'measure' || tool === 'annotate') {
      const point = e.point.clone();
      const start = new THREE.Vector3(...pipeline.startPoint);
      const end = new THREE.Vector3(...pipeline.endPoint);
      const segDir = end.clone().sub(start).normalize();
      const toPoint = point.clone().sub(start);
      let t = toPoint.dot(segDir);
      const segLen = end.clone().sub(start).length();
      t = Math.max(0, Math.min(segLen, t));
      const projected = start.clone().add(segDir.multiplyScalar(t));
      const toSurface = point.clone().sub(projected).normalize();
      const surfacePoint = projected.add(toSurface.multiplyScalar(diameter / 2));
      pushMeasurePoint([surfacePoint.x, surfacePoint.y, surfacePoint.z]);
    } else {
      select(pipeline.id);
    }
  };

  const transparent = style.opacity < 1;
  const opacity = style.opacity;
  const wireframe = style.showWireframe;
  const roughness = style.roughness;
  const metalness = style.metalness;

  return (
    <group position={position} quaternion={quaternion} userData={{ pipelineId: pipeline.id, axis: axis.toArray() }}>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          hover(pipeline.id);
        }}
        onPointerOut={() => hover(null)}
        onClick={handleClick}
        castShadow
        receiveShadow
        renderOrder={1}
        frustumCulled={frustumCulling}
      >
        <primitive object={geometry} attach="geometry" />
        <meshStandardMaterial
          color={color}
          metalness={metalness}
          roughness={roughness}
          emissive={isSelected ? color : isHovered ? '#0b1e3f' : '#000000'}
          emissiveIntensity={isSelected ? 0.45 : isHovered ? 0.12 : 0}
          clippingPlanes={clippingPlane ? [clippingPlane] : undefined}
          clipShadows
          depthWrite={!transparent}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
          transparent={transparent}
          opacity={opacity}
          wireframe={wireframe}
        />
      </mesh>
      {(isSelected || isHovered) && style.showOutline && (
        <mesh renderOrder={2}>
          <cylinderGeometry
            args={[diameter / 2 + 0.015, diameter / 2 + 0.015, length + 0.002, 24, 1]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.18}
            side={THREE.BackSide}
            depthWrite={false}
            clippingPlanes={clippingPlane ? [clippingPlane] : undefined}
          />
        </mesh>
      )}
    </group>
  );
}
