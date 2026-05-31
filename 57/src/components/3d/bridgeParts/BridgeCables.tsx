import { useMemo } from 'react';
import * as THREE from 'three';
import { getStressColor } from '../../../utils/stressColors';

interface BridgeCablesProps {
  viewMode: string;
  stressData: any;
  minStress: number;
  maxStress: number;
  onClick?: (event: any) => void;
}

export function BridgeCables({
  viewMode,
  stressData,
  minStress,
  maxStress,
  onClick,
}: BridgeCablesProps) {
  const cableGeometry = useMemo(() => new THREE.CylinderGeometry(0.06, 0.06, 1, 8), []);
  const hangerCableGeometry = useMemo(() => new THREE.CylinderGeometry(0.03, 0.03, 1, 6), []);

  const getMaterial = (stressValue: number, baseColor: string, metalness = 0.7, roughness = 0.3) => {
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

  const cableMaterial = getMaterial(40, '#1F2937', 0.75, 0.25);
  const hangerCableMaterial = getMaterial(30, '#374151', 0.7, 0.3);

  const mainCables = useMemo(() => {
    const cables: JSX.Element[] = [];
    const cableCount = 12;
    const spanLength = 35;
    const sagHeight = 3;
    
    for (let i = 0; i < cableCount; i++) {
      const t = i / (cableCount - 1);
      const x = -spanLength / 2 + t * spanLength;
      const y = 6 - sagHeight * 4 * t * (1 - t);
      const cableLength = Math.sqrt((spanLength / cableCount) ** 2 + (sagHeight * 4 * (1 - 2 * t) / cableCount) ** 2);
      const angle = Math.atan2(sagHeight * 4 * (1 - 2 * t) / cableCount, spanLength / cableCount);
      
      cables.push(
        <group key={`main-cable-${i}`} position={[x + spanLength / (2 * cableCount), y + cableLength / 2, 0]}>
          <mesh
            geometry={cableGeometry}
            material={cableMaterial}
            scale={[1, cableLength, 1]}
            rotation={[0, 0, angle]}
            onClick={onClick}
            castShadow
          />
        </group>
      );
    }
    return cables;
  }, [cableGeometry, cableMaterial, onClick]);

  const hangerCables = useMemo(() => {
    const hangers: JSX.Element[] = [];
    const hangerCount = 14;
    const spanLength = 35;
    
    for (let i = 0; i < hangerCount; i++) {
      const t = (i + 0.5) / hangerCount;
      const x = -spanLength / 2 + t * spanLength;
      const sagY = 6 - 3 * 4 * t * (1 - t);
      const deckY = 0.6;
      const hangerLength = sagY - deckY;
      
      hangers.push(
        <group key={`hanger-${i}`} position={[x, (sagY + deckY) / 2, 0]}>
          <mesh
            geometry={hangerCableGeometry}
            material={hangerCableMaterial}
            scale={[1, hangerLength, 1]}
            onClick={onClick}
            castShadow
          />
        </group>
      );
    }
    return hangers;
  }, [hangerCableGeometry, hangerCableMaterial, onClick]);

  const sideCables = useMemo(() => {
    const cables: JSX.Element[] = [];
    const positions = [
      { x: -16, z: 0.9 },
      { x: -16, z: -0.9 },
      { x: 16, z: 0.9 },
      { x: 16, z: -0.9 },
    ];
    
    positions.forEach((pos, idx) => {
      const angle = Math.atan2(6, 16);
      cables.push(
        <group key={`side-cable-${idx}`} position={[pos.x / 2, 3, pos.z]} rotation={[0, 0, pos.x > 0 ? -angle : angle]}>
          <mesh
            geometry={cableGeometry}
            material={cableMaterial}
            scale={[1, Math.sqrt(16 ** 2 + 6 ** 2), 1]}
            onClick={onClick}
            castShadow
          />
        </group>
      );
    });
    return cables;
  }, [cableGeometry, cableMaterial, onClick]);

  return (
    <group>
      {mainCables}
      {hangerCables}
      {sideCables}
    </group>
  );
}
