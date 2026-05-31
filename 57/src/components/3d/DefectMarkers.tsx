import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useBridgeStore } from '../../store/useBridgeStore';
import { severityColors, defectTypeIcons } from '../../utils/stressColors';
import type { DefectData } from '../../../shared';

interface DefectMarkersProps {
  onMarkerClick?: (defect: DefectData) => void;
}

function DefectMarker({
  defect,
  isSelected,
  layerColor,
  onClick,
}: {
  defect: DefectData;
  isSelected: boolean;
  layerColor: string;
  onClick: (event: any) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const baseColor = severityColors[defect.severity] || layerColor;
  const scale = isSelected ? 1.4 : 1;

  useFrame((state) => {
    if (ringRef.current && isSelected) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.5;
    }
    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      groupRef.current.position.y = defect.position.y + Math.sin(t * 2 + defect.position.x) * 0.03;
    }
  });

  const validatePosition = () => {
    const { x, y, z } = defect.position;
    const clampedY = Math.max(-6, Math.min(12, y));
    return new THREE.Vector3(x, clampedY, z);
  };

  const position = validatePosition();

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]}>
      <mesh
        ref={ringRef}
        onClick={onClick}
        scale={isSelected ? [1.8, 1.8, 1.8] : [1.2, 1.2, 1.2]}
      >
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={isSelected ? 1 : 0.4}
          transparent
          opacity={0.3}
        />
      </mesh>

      <mesh onClick={onClick} scale={scale}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={isSelected ? 0.9 : 0.5}
          transparent
          opacity={0.95}
        />
      </mesh>

      <mesh onClick={onClick} scale={scale * 0.6}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.25, 0.32, 32]} />
          <meshBasicMaterial
            color={baseColor}
            side={THREE.DoubleSide}
            transparent
            opacity={0.7}
          />
        </mesh>
      )}

      <sprite
        scale={[0.6, 0.3, 1]}
        position={[0, 0.45, 0]}
        onClick={onClick}
      >
        <spriteMaterial
          color={baseColor}
          transparent
          opacity={0.85}
        />
      </sprite>

      <mesh position={[0, 0.45, 0]}>
        <planeGeometry args={[0.5, 0.25]} />
        <meshBasicMaterial
          color={baseColor}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function DefectMarkers({ onMarkerClick }: DefectMarkersProps) {
  const { defects, layers, selectedDefect, selectDefect } = useBridgeStore();

  const visibleDefects = useMemo(() => {
    const visibleLayerIds = new Set(
      layers.filter((l) => l.visible).map((l) => l.id)
    );
    return defects.filter((d) => visibleLayerIds.has(d.layerId));
  }, [defects, layers]);

  const getLayerColor = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    return layer?.color || '#EF4444';
  };

  const handleClick = (defect: DefectData, event: any) => {
    event.stopPropagation();
    selectDefect(defect);
    if (onMarkerClick) {
      onMarkerClick(defect);
    }
  };

  return (
    <group>
      {visibleDefects.map((defect) => {
        const isSelected = selectedDefect?.id === defect.id;
        const layerColor = getLayerColor(defect.layerId);

        return (
          <DefectMarker
            key={defect.id}
            defect={defect}
            isSelected={isSelected}
            layerColor={layerColor}
            onClick={(e) => handleClick(defect, e)}
          />
        );
      })}
    </group>
  );
}
