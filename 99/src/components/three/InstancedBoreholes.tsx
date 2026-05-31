import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import type { Borehole } from '@/types';
import type { SceneParams } from '@/utils/geoUtils';
import { lonLatToSceneCoord } from '@/utils/geoUtils';
import { materialPool } from '@/utils/materialPool';

interface InstancedBoreholesProps {
  boreholes: Borehole[];
  sceneParams: SceneParams;
  selectedId?: string | null;
  opacity?: number;
  onSelect?: (borehole: Borehole) => void;
}

const dummy = new THREE.Object3D();

export default function InstancedBoreholes({
  boreholes,
  sceneParams,
  selectedId = null,
  opacity = 1,
  onSelect,
}: InstancedBoreholesProps) {
  const cylinderRef = useRef<THREE.InstancedMesh>(null);
  const sphereRef = useRef<THREE.InstancedMesh>(null);

  const { instanceData, layerColorGroups, sphereData } = useMemo(() => {
    const sphereInstances: { position: [number, number, number]; borehole: Borehole; isSelected: boolean }[] = [];
    const allInstances: { position: [number, number, number]; scale: [number, number, number]; color: THREE.Color; borehole: Borehole; isSelected: boolean }[] = [];

    boreholes.forEach((borehole) => {
      const [x, y, z] = lonLatToSceneCoord(
        borehole.longitude,
        borehole.latitude,
        borehole.elevation,
        sceneParams
      );

      const isSelected = selectedId === borehole.id;
      const { verticalExaggeration } = sceneParams;

      borehole.layers.forEach((layer) => {
        const layerTopY = y - layer.topDepth * verticalExaggeration;
        const layerBottomY = y - layer.bottomDepth * verticalExaggeration;
        const layerHeight = Math.max((layer.bottomDepth - layer.topDepth) * verticalExaggeration, 0.1);
        const centerY = (layerTopY + layerBottomY) / 2;

        allInstances.push({
          position: [x, centerY, z],
          scale: [0.3, layerHeight, 0.3],
          color: new THREE.Color(layer.color),
          borehole,
          isSelected,
        });
      });

      sphereInstances.push({
        position: [x, y, z],
        borehole,
        isSelected,
      });
    });

    const colorGroups: { color: THREE.Color; instances: { position: [number, number, number]; scale: [number, number, number]; borehole: Borehole; isSelected: boolean }[] }[] = [];
    allInstances.forEach((inst) => {
      const colorKey = inst.color.getHexString();
      let group = colorGroups.find((g) => g.color.getHexString() === colorKey);
      if (!group) {
        group = { color: inst.color, instances: [] };
        colorGroups.push(group);
      }
      group.instances.push(inst);
    });

    return {
      instanceData: allInstances,
      layerColorGroups: colorGroups,
      sphereData: sphereInstances,
    };
  }, [boreholes, sceneParams, selectedId]);

  const cylinderMaterial = useMemo(() => {
    return materialPool.getMaterial({
      color: '#ffffff',
      opacity,
      transparent: opacity < 1,
      roughness: 0.7,
      metalness: 0.05,
      vertexColors: true,
    });
  }, [opacity]);

  const sphereMaterial = useMemo(() => {
    return materialPool.getMaterial({
      color: '#ffffff',
      vertexColors: true,
    });
  }, []);

  const cylinderGeometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8), []);
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);

  useEffect(() => {
    if (!cylinderRef.current) return;

    instanceData.forEach((inst, idx) => {
      if (idx >= cylinderRef.current!.count) return;

      dummy.position.set(...inst.position);
      dummy.scale.set(...inst.scale);
      dummy.updateMatrix();

      cylinderRef.current!.setMatrixAt(idx, dummy.matrix);

      if (inst.isSelected) {
        cylinderRef.current!.setColorAt(idx, new THREE.Color(0xffffff));
      } else {
        cylinderRef.current!.setColorAt(idx, inst.color);
      }
    });

    cylinderRef.current.instanceMatrix.needsUpdate = true;
    if (cylinderRef.current.instanceColor) {
      cylinderRef.current.instanceColor.needsUpdate = true;
    }
  }, [instanceData]);

  useEffect(() => {
    if (!sphereRef.current) return;

    sphereData.forEach((inst, idx) => {
      if (idx >= sphereRef.current!.count) return;

      dummy.position.set(...inst.position);
      dummy.scale.setScalar(0.5);
      dummy.updateMatrix();

      sphereRef.current!.setMatrixAt(idx, dummy.matrix);

      if (inst.isSelected) {
        sphereRef.current!.setColorAt(idx, new THREE.Color(0xffffff));
      } else {
        sphereRef.current!.setColorAt(idx, new THREE.Color(0xff6b35));
      }
    });

    sphereRef.current.instanceMatrix.needsUpdate = true;
    if (sphereRef.current.instanceColor) {
      sphereRef.current.instanceColor.needsUpdate = true;
    }
  }, [sphereData]);

  const handleCylinderClick = (e: any) => {
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId !== undefined && instanceId !== null) {
      const borehole = instanceData[instanceId]?.borehole;
      if (borehole && onSelect) {
        onSelect(borehole);
      }
    }
  };

  const handleSphereClick = (e: any) => {
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId !== undefined && instanceId !== null) {
      const borehole = sphereData[instanceId]?.borehole;
      if (borehole && onSelect) {
        onSelect(borehole);
      }
    }
  };

  return (
    <group>
      {instanceData.length > 0 && (
        <instancedMesh
          ref={cylinderRef}
          args={[cylinderGeometry, cylinderMaterial, instanceData.length]}
          onClick={handleCylinderClick}
        />
      )}

      {sphereData.length > 0 && (
        <instancedMesh
          ref={sphereRef}
          args={[sphereGeometry, sphereMaterial, sphereData.length]}
          onClick={handleSphereClick}
        />
      )}

      {sphereData.slice(0, 20).map((inst, idx) => (
        <Text
          key={`label-${idx}`}
          position={[inst.position[0], inst.position[1] + 2, inst.position[2]]}
          fontSize={0.8}
          color="white"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.04}
          outlineColor="#000000"
        >
          {boreholes[idx]?.name || ''}
        </Text>
      ))}
    </group>
  );
}
