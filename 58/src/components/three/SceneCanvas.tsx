import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, Stats } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import TunnelShell from './TunnelShell';
import PipelineScene from './PipelineScene';
import CollisionMarkers from './CollisionMarkers';
import ClipPlane from './ClipPlane';
import MeasurementOverlay from './MeasurementOverlay';
import { useScene } from '@/store/scene';
import { PIPELINE_TYPE_COLOR } from '@shared/types';
import type { Pipeline } from '@shared/types';

function LODPipeline({ pipeline, distances = [15, 35, 60] }: { pipeline: Pipeline; distances?: number[] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lodRef = useRef<THREE.LOD>(null);
  const style = useScene((s) => s.style);
  const diameter = pipeline.diameter / 1000;
  const isSelected = useScene((s) => s.selectedId === pipeline.id);
  const isHovered = useScene((s) => s.hoveredId === pipeline.id);
  const select = useScene((s) => s.select);
  const hover = useScene((s) => s.hover);

  const color = PIPELINE_TYPE_COLOR[pipeline.type] || '#888';

  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...pipeline.startPoint);
    const end = new THREE.Vector3(...pipeline.endPoint);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const len = dir.length();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const normalizedDir = dir.clone().normalize();
    q.setFromUnitVectors(up, normalizedDir);
    return { position: [mid.x, mid.y, mid.z] as [number, number, number], quaternion: q, length: len };
  }, [pipeline.startPoint, pipeline.endPoint]);

  const [lodHigh, lodMid, lodLow] = useMemo(() => {
    const createGeom = (rs: number, hs: number) =>
      new THREE.CylinderGeometry(diameter / 2, diameter / 2, length, rs, hs, false);
    return [
      createGeom(diameter < 0.15 ? 18 : diameter < 0.4 ? 28 : 36, Math.max(2, Math.min(64, Math.ceil(length / 0.8)))),
      createGeom(12, Math.max(2, Math.min(16, Math.ceil(length / 2)))),
      createGeom(6, Math.max(2, Math.min(8, Math.ceil(length / 4)))),
    ];
  }, [diameter, length]);

  useFrame(() => {
    if (!lodRef.current) return;
    const bias = style.lodBias || 0;
    lodRef.current.levels.forEach((level, index) => {
      const threshold = distances[index] * (1 + bias);
      level.distance = threshold;
    });
  });

  const handleClick = (e: any) => {
    e.stopPropagation();
    select(pipeline.id);
  };

  return (
    <group position={position} quaternion={quaternion}>
      <primitive object={new THREE.LOD()} ref={lodRef} frustumCulled={style.frustumCulling}>
        <mesh
          ref={meshRef}
          onPointerOver={(e) => { e.stopPropagation(); hover(pipeline.id); }}
          onPointerOut={() => hover(null)}
          onClick={handleClick}
          castShadow
          receiveShadow
        >
          <primitive object={lodHigh} attach="geometry" />
          <meshStandardMaterial
            color={color}
            metalness={style.metalness}
            roughness={style.roughness}
            emissive={isSelected ? color : isHovered ? '#0b1e3f' : '#000000'}
            emissiveIntensity={isSelected ? 0.45 : isHovered ? 0.12 : 0}
            transparent={style.opacity < 1}
            opacity={style.opacity}
            wireframe={style.showWireframe}
            depthWrite={!(style.opacity < 1)}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
        <mesh castShadow receiveShadow>
          <primitive object={lodMid} attach="geometry" />
          <meshStandardMaterial color={color} metalness={style.metalness} roughness={style.roughness} />
        </mesh>
        <mesh>
          <primitive object={lodLow} attach="geometry" />
          <meshStandardMaterial color={color} metalness={0.1} roughness={0.8} />
        </mesh>
      </primitive>
      {(isSelected || isHovered) && style.showOutline && (
        <mesh renderOrder={2}>
          <cylinderGeometry args={[diameter / 2 + 0.015, diameter / 2 + 0.015, length + 0.002, 24, 1]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} side={THREE.BackSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function SceneContent() {
  const clip = useScene((s) => s.clip);

  return (
    <>
      <PerspectiveCamera makeDefault position={[60, 40, 60]} fov={50} near={0.1} far={500} />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={300}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />

      <color attach="background" args={['#050b1c']} />
      <fog attach="fog" args={['#050b1c', 80, 300]} />

      <ambientLight intensity={0.3} color="#4a6fa8" />
      <directionalLight
        position={[30, 50, 30]}
        intensity={0.8}
        color="#88aaff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={['#3355aa', '#0a1a3a', 0.4]} />

      <Suspense fallback={null}>
        <Grid
          args={[300, 300]}
          cellSize={5}
          cellThickness={0.5}
          cellColor="#0f2547"
          sectionSize={20}
          sectionThickness={1}
          sectionColor="#1a3a7a"
          fadeDistance={200}
          fadeStrength={1}
          position={[60, 0, 0]}
        />

        <TunnelShell />
        <PipelineScene />
        <CollisionMarkers />
        <ClipPlane />
        <MeasurementOverlay />
      </Suspense>
    </>
  );
}

export default function SceneCanvas() {
  const clip = useScene((s) => s.clip);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      THREE.Object3D.DEFAULT_MATRIX_AUTO_UPDATE = true;
    }
  }, []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
        localClippingEnabled: clip.enabled,
        powerPreference: 'high-performance',
      }}
      onPointerMissed={() => useScene.getState().select(null)}
    >
      <SceneContent />
      <Stats className="absolute top-0 right-0" />
    </Canvas>
  );
}
