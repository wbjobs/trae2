import { useMemo } from 'react';
import * as THREE from 'three';
import type { GeoLayer, Borehole } from '@/types';
import type { SceneParams } from '@/utils/geoUtils';
import { lonLatToSceneCoord, idwInterpolate } from '@/utils/geoUtils';

interface StratumLayersProps {
  geoLayers: GeoLayer[];
  boreholes: Borehole[];
  sceneParams: SceneParams;
  opacity?: number;
  selectedId?: string | null;
  onSelect?: (layer: GeoLayer) => void;
  clippingPlanes?: THREE.Plane[];
}

const GRID_SIZE = 30;

export default function StratumLayers({
  geoLayers,
  boreholes,
  sceneParams,
  opacity = 0.7,
  selectedId = null,
  onSelect,
  clippingPlanes = [],
}: StratumLayersProps) {
  const stratumMeshes = useMemo(() => {
    if (boreholes.length === 0) return [];

    const layerNames = [...new Set(boreholes.flatMap((b) => b.layers.map((l) => l.layerName)))];

    const sceneBoreholes = boreholes.map((b) => {
      const [x, y, z] = lonLatToSceneCoord(
        b.longitude,
        b.latitude,
        b.elevation,
        sceneParams
      );
      return {
        ...b,
        sceneX: x,
        sceneY: y,
        sceneZ: z,
      };
    });

    const bounds = {
      minX: Math.min(...sceneBoreholes.map((b) => b.sceneX)) - 5,
      maxX: Math.max(...sceneBoreholes.map((b) => b.sceneX)) + 5,
      minZ: Math.min(...sceneBoreholes.map((b) => b.sceneZ)) - 5,
      maxZ: Math.max(...sceneBoreholes.map((b) => b.sceneZ)) + 5,
    };

    return layerNames.map((layerName, layerIndex) => {
      const controlPoints: { x: number; y: number; value: number }[] = [];

      sceneBoreholes.forEach((borehole) => {
        const layer = borehole.layers.find((l) => l.layerName === layerName);
        if (layer) {
          const depth = (layer.topDepth + layer.bottomDepth) / 2;
          const elevation = borehole.elevation - depth;
          controlPoints.push({
            x: borehole.sceneX,
            y: borehole.sceneZ,
            value: elevation * sceneParams.verticalExaggeration,
          });
        }
      });

      if (controlPoints.length < 3) return null;

      const geometry = new THREE.PlaneGeometry(
        bounds.maxX - bounds.minX,
        bounds.maxZ - bounds.minZ,
        GRID_SIZE - 1,
        GRID_SIZE - 1
      );

      geometry.rotateX(-Math.PI / 2);

      const positions = geometry.attributes.position;
      const geoLayer = geoLayers.find((l) => l.name.includes(layerName)) || geoLayers[layerIndex % geoLayers.length];
      const color = new THREE.Color(geoLayer?.color || '#666666');

      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);

        const worldX = x + (bounds.minX + bounds.maxX) / 2;
        const worldZ = z + (bounds.minZ + bounds.maxZ) / 2;

        const elevation = idwInterpolate(controlPoints, worldX, worldZ, 2);
        positions.setY(i, elevation);
      }

      geometry.computeVertexNormals();

      const isSelected = selectedId === geoLayer?.id;

      const edgesGeometry = new THREE.EdgesGeometry(geometry);

      return {
        id: geoLayer?.id || `layer-${layerIndex}`,
        position: [(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2] as [number, number, number],
        geometry,
        edgesGeometry,
        color,
        isSelected,
        layer: geoLayer,
      };
    }).filter(Boolean);
  }, [geoLayers, boreholes, sceneParams, selectedId]);

  const handleClick = (e: { stopPropagation: () => void }, layer: GeoLayer) => {
    e.stopPropagation();
    onSelect?.(layer);
  };

  return (
    <group>
      {stratumMeshes.map((meshData) => {
        if (!meshData) return null;
        return (
          <group key={meshData.id} position={meshData.position}>
            <mesh
              geometry={meshData.geometry}
              onClick={(e) => meshData.layer && handleClick(e, meshData.layer)}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                color={meshData.color}
                transparent
                opacity={opacity}
                side={THREE.DoubleSide}
                emissive={meshData.isSelected ? meshData.color : new THREE.Color(0x000000)}
                emissiveIntensity={meshData.isSelected ? 0.2 : 0}
                roughness={0.6}
                metalness={0.1}
                clippingPlanes={clippingPlanes}
                clipShadows
              />
            </mesh>
            <lineSegments geometry={meshData.edgesGeometry}>
              <lineBasicMaterial
                color={meshData.color}
                transparent
                opacity={opacity * 0.8}
              />
            </lineSegments>
          </group>
        );
      })}
    </group>
  );
}
