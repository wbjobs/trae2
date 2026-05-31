import { useMemo } from 'react';
import * as THREE from 'three';
import { getStressColor } from '../../../utils/stressColors';

interface BridgeTowerProps {
  position: [number, number, number];
  viewMode: string;
  stressData: any;
  minStress: number;
  maxStress: number;
  onClick?: (event: any) => void;
}

export function BridgeTower({
  position,
  viewMode,
  stressData,
  minStress,
  maxStress,
  onClick,
}: BridgeTowerProps) {
  const mainTowerGeometry = useMemo(() => new THREE.BoxGeometry(1.6, 12, 1.6), []);
  const towerBaseGeometry = useMemo(() => new THREE.BoxGeometry(3, 1.5, 3), []);
  const towerCrossbeamGeometry = useMemo(() => new THREE.BoxGeometry(2, 0.4, 1.6), []);
  const slantLegGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 6, 0.8), []);

  const getMaterial = (stressValue: number, baseColor: string, metalness = 0.5, roughness = 0.5) => {
    if (viewMode === 'stress' && stressData) {
      return new THREE.MeshStandardMaterial({
        color: getStressColor(stressValue, minStress, maxStress),
        metalness,
        roughness,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness,
      roughness,
      wireframe: viewMode === 'wireframe',
    });
  };

  const towerMaterial = getMaterial(80, '#4B5563', 0.55, 0.45);
  const towerBaseMaterial = getMaterial(45, '#374151', 0.3, 0.7);

  return (
    <group position={position}>
      <mesh
        geometry={towerBaseGeometry}
        material={towerBaseMaterial}
        position={[0, -0.75, 0]}
        onClick={onClick}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={mainTowerGeometry}
        material={towerMaterial}
        position={[0, 6, 0]}
        onClick={onClick}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={towerCrossbeamGeometry}
        material={towerMaterial}
        position={[0, 10, 0]}
        onClick={onClick}
        castShadow
      />
      <mesh
        geometry={towerCrossbeamGeometry}
        material={towerMaterial}
        position={[0, 2, 0]}
        onClick={onClick}
        castShadow
      />
      <group position={[0, -2, 1.5]} rotation={[0.3, 0, 0]}>
        <mesh
          geometry={slantLegGeometry}
          material={towerBaseMaterial}
          position={[0, 0, 0]}
          onClick={onClick}
          castShadow
        />
      </group>
      <group position={[0, -2, -1.5]} rotation={[-0.3, 0, 0]}>
        <mesh
          geometry={slantLegGeometry}
          material={towerBaseMaterial}
          position={[0, 0, 0]}
          onClick={onClick}
          castShadow
        />
      </group>
    </group>
  );
}
