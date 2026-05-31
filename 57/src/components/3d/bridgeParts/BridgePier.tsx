import { useMemo } from 'react';
import * as THREE from 'three';
import { getStressColor } from '../../../utils/stressColors';

interface BridgePierProps {
  position: [number, number, number];
  viewMode: string;
  stressData: any;
  minStress: number;
  maxStress: number;
  onClick?: (event: any) => void;
}

export function BridgePier({
  position,
  viewMode,
  stressData,
  minStress,
  maxStress,
  onClick,
}: BridgePierProps) {
  const pierGeometry = useMemo(() => new THREE.CylinderGeometry(0.7, 0.9, 6, 16), []);
  const pierCapGeometry = useMemo(() => new THREE.BoxGeometry(2.5, 0.8, 2.5), []);
  const bearingGeometry = useMemo(() => new THREE.CylinderGeometry(0.15, 0.15, 0.3, 12), []);

  const getMaterial = (stressValue: number, baseColor: string, metalness = 0.3, roughness = 0.7) => {
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

  const pierMaterial = getMaterial(55, '#9CA3AF', 0.15, 0.85);
  const bearingMaterial = getMaterial(70, '#6B7280', 0.6, 0.4);

  return (
    <group position={position}>
      <mesh
        geometry={pierGeometry}
        material={pierMaterial}
        position={[0, -3, 0]}
        onClick={onClick}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={pierCapGeometry}
        material={pierMaterial}
        position={[0, -0.2, 0]}
        onClick={onClick}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={bearingGeometry}
        material={bearingMaterial}
        position={[0, 0.3, 0.8]}
        onClick={onClick}
        castShadow
      />
      <mesh
        geometry={bearingGeometry}
        material={bearingMaterial}
        position={[0, 0.3, -0.8]}
        onClick={onClick}
        castShadow
      />
    </group>
  );
}
