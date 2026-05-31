import { useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useBridgeStore } from '../../store/useBridgeStore';
import { BridgeTower } from './bridgeParts/BridgeTower';
import { BridgeDeck } from './bridgeParts/BridgeDeck';
import { BridgePier } from './bridgeParts/BridgePier';
import { BridgeCables } from './bridgeParts/BridgeCables';
import { LazyBridgePart } from './bridgeParts/LazyBridgePart';

interface BridgeModelProps {
  onMeshClick?: (point: THREE.Vector3, faceNormal: THREE.Vector3) => void;
}

export function BridgeModel({ onMeshClick }: BridgeModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { viewMode, stressResults } = useBridgeStore();
  
  const stressData = useMemo(() => {
    if (stressResults.length === 0) return null;
    return stressResults[0];
  }, [stressResults]);

  const minStress = stressData?.minStress ?? 20;
  const maxStress = stressData?.maxStress ?? 100;

  const handleClick = useCallback((event: any) => {
    event.stopPropagation();
    if (onMeshClick) {
      onMeshClick(event.point.clone(), event.face?.normal?.clone() || new THREE.Vector3(0, 1, 0));
    }
  }, [onMeshClick]);

  const pierPositions: [number, number, number][] = [
    [-12, 0, 0],
    [-6, 0, 0],
    [6, 0, 0],
    [12, 0, 0],
  ];

  const towerPositions: [number, number, number][] = [
    [-16, 0, 0],
    [16, 0, 0],
  ];

  const lowPolyFallback = (
    <mesh>
      <boxGeometry args={[2, 2, 2]} />
      <meshBasicMaterial color="#475569" wireframe transparent opacity={0.3} />
    </mesh>
  );

  return (
    <group ref={groupRef}>
      <LazyBridgePart
        id="deck"
        position={[0, 0, 0]}
        loadDistance={100}
        fallback={lowPolyFallback}
      >
        <BridgeDeck
          viewMode={viewMode}
          stressData={stressData}
          minStress={minStress}
          maxStress={maxStress}
          onClick={handleClick}
        />
      </LazyBridgePart>

      {towerPositions.map((pos, idx) => (
        <LazyBridgePart
          key={`tower-${idx}`}
          id={`tower-${idx}`}
          position={pos}
          loadDistance={80}
          fallback={lowPolyFallback}
        >
          <BridgeTower
            position={[0, 0, 0]}
            viewMode={viewMode}
            stressData={stressData}
            minStress={minStress}
            maxStress={maxStress}
            onClick={handleClick}
          />
        </LazyBridgePart>
      ))}

      {pierPositions.map((pos, idx) => (
        <LazyBridgePart
          key={`pier-${idx}`}
          id={`pier-${idx}`}
          position={pos}
          loadDistance={60}
          fallback={lowPolyFallback}
        >
          <BridgePier
            position={[0, 0, 0]}
            viewMode={viewMode}
            stressData={stressData}
            minStress={minStress}
            maxStress={maxStress}
            onClick={handleClick}
          />
        </LazyBridgePart>
      ))}

      <LazyBridgePart
        id="cables"
        position={[0, 0, 0]}
        loadDistance={70}
        fallback={null}
      >
        <BridgeCables
          viewMode={viewMode}
          stressData={stressData}
          minStress={minStress}
          maxStress={maxStress}
          onClick={handleClick}
        />
      </LazyBridgePart>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -6, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#1E293B" />
      </mesh>
    </group>
  );
}
