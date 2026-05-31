import { useMemo } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import type { Borehole } from '@/types';
import type { SceneParams } from '@/utils/geoUtils';
import { lonLatToSceneCoord } from '@/utils/geoUtils';

interface BoreholePointsProps {
  boreholes: Borehole[];
  sceneParams: SceneParams;
  selectedId?: string | null;
  opacity?: number;
  onSelect?: (borehole: Borehole) => void;
  visibleLayers?: string[];
  clippingPlanes?: THREE.Plane[];
}

export default function BoreholePoints({
  boreholes,
  sceneParams,
  selectedId = null,
  opacity = 1,
  onSelect,
  visibleLayers,
  clippingPlanes = [],
}: BoreholePointsProps) {
  const boreholeData = useMemo(() => {
    return boreholes.map((borehole) => {
      const [x, y, z] = lonLatToSceneCoord(
        borehole.longitude,
        borehole.latitude,
        borehole.elevation,
        sceneParams
      );

      const isSelected = selectedId === borehole.id;
      const { verticalExaggeration } = sceneParams;

      const layerData = borehole.layers
        .filter((layer) => !visibleLayers || visibleLayers.includes(layer.layerName))
        .map((layer) => {
          const layerTopY = y - layer.topDepth * verticalExaggeration;
          const layerBottomY = y - layer.bottomDepth * verticalExaggeration;
          const layerHeight = (layer.bottomDepth - layer.topDepth) * verticalExaggeration;
          const centerY = (layerTopY + layerBottomY) / 2;

          return {
            ...layer,
            position: [x, centerY, z] as [number, number, number],
            height: Math.max(layerHeight, 0.1),
            color: new THREE.Color(layer.color),
          };
        });

      const topY = y + 2;

      return {
        id: borehole.id,
        name: borehole.name,
        position: [x, y, z] as [number, number, number],
        topPosition: [x, topY, z] as [number, number, number],
        isSelected,
        layers: layerData,
        borehole,
      };
    });
  }, [boreholes, sceneParams, selectedId]);

  const handleClick = (e: { stopPropagation: () => void }, borehole: Borehole) => {
    e.stopPropagation();
    onSelect?.(borehole);
  };

  return (
    <group>
      {boreholeData.map((borehole) => (
        <group key={borehole.id}>
          {borehole.layers.map((layer) => (
            <mesh
              key={layer.id}
              position={layer.position}
              onClick={(e) => handleClick(e, borehole.borehole)}
              castShadow
            >
              <cylinderGeometry args={[0.3, 0.3, layer.height, 8]} />
              <meshStandardMaterial
                color={layer.color}
                transparent
                opacity={opacity}
                emissive={borehole.isSelected ? layer.color : new THREE.Color(0x000000)}
                emissiveIntensity={borehole.isSelected ? 0.3 : 0}
                clippingPlanes={clippingPlanes}
                clipShadows
              />
            </mesh>
          ))}
          <mesh
            position={borehole.position}
            onClick={(e) => handleClick(e, borehole.borehole)}
            castShadow
          >
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshStandardMaterial
              color={borehole.isSelected ? 0xffffff : 0xff6b35}
              emissive={borehole.isSelected ? 0xff6b35 : 0x000000}
              emissiveIntensity={borehole.isSelected ? 0.5 : 0}
              clippingPlanes={clippingPlanes}
              clipShadows
            />
          </mesh>
          <Text
            position={borehole.topPosition}
            fontSize={0.8}
            color="white"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.04}
            outlineColor="#000000"
          >
            {borehole.name}
          </Text>
        </group>
      ))}
    </group>
  );
}
