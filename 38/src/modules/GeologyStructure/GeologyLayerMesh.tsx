import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { GeologyLayer, TerrainData } from '../../types';
import { generateGeologyLayerGeometry } from './geologyGeometry';

interface GeologyLayerMeshProps {
  layer: GeologyLayer;
  terrainData: TerrainData;
  opacity?: number;
  visible?: boolean;
  clipPlanes?: THREE.Plane[];
  quality?: 'high' | 'medium' | 'low';
}

export function GeologyLayerMesh({
  layer,
  terrainData,
  opacity = 0.7,
  visible = true,
  clipPlanes,
  quality = 'medium',
}: GeologyLayerMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const step = useMemo(() => {
    switch (quality) {
      case 'high': return 1;
      case 'medium': return 2;
      case 'low': return 4;
      default: return 2;
    }
  }, [quality]);

  const geometry = useMemo(() => {
    const result = generateGeologyLayerGeometry(layer, terrainData, { step });
    return result.geometry;
  }, [layer, terrainData, step]);

  const color = useMemo(() => {
    return new THREE.Color(layer.color);
  }, [layer.color]);

  useEffect(() => {
    if (meshRef.current && geometry) {
      meshRef.current.geometry = geometry;
      geometry.computeBoundingSphere();
    }
  }, [geometry]);

  if (!visible) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        roughness={0.7}
        metalness={0.1}
        clippingPlanes={clipPlanes}
        clipShadows={true}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
  );
}

interface GeologyLayerWedgeProps {
  layer: GeologyLayer;
  terrainData: TerrainData;
  sectionNormal: [number, number, number];
  sectionOrigin: [number, number, number];
  opacity?: number;
}

export function GeologyLayerWedge({
  layer,
  terrainData,
  sectionNormal,
  sectionOrigin,
  opacity = 0.9,
}: GeologyLayerWedgeProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const result = generateGeologyLayerGeometry(layer, terrainData, {
      step: 2,
      clipNormal: sectionNormal,
      clipOrigin: sectionOrigin,
      clipEpsilon: 0.5,
    });
    return result.geometry;
  }, [layer, terrainData, sectionNormal, sectionOrigin]);

  const color = useMemo(() => {
    return new THREE.Color(layer.color);
  }, [layer.color]);

  if (geometry.attributes.position.count === 0) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        roughness={0.7}
        metalness={0.1}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

interface GeologyLayerManagerProps {
  layers: GeologyLayer[];
  terrainData: TerrainData;
  layerOpacities?: Record<string, number>;
  layerVisibility?: Record<string, boolean>;
  clipPlanes?: THREE.Plane[];
  quality?: 'high' | 'medium' | 'low';
}

export function GeologyLayerManager({
  layers,
  terrainData,
  layerOpacities = {},
  layerVisibility = {},
  clipPlanes,
  quality = 'medium',
}: GeologyLayerManagerProps) {
  return (
    <>
      {layers.map((layer) => (
        <GeologyLayerMesh
          key={layer.id}
          layer={layer}
          terrainData={terrainData}
          opacity={layerOpacities[layer.id] ?? 0.7}
          visible={layerVisibility[layer.id] !== false}
          clipPlanes={clipPlanes}
          quality={quality}
        />
      ))}
    </>
  );
}
