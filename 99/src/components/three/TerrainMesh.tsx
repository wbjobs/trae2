import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import type { DEMData } from '@/types';
import { getElevationColorThree } from '@/utils/geoUtils';

interface TerrainMeshProps {
  demData: DEMData;
  wireframe?: boolean;
  opacity?: number;
  verticalExaggeration?: number;
  onClick?: (point: [number, number, number]) => void;
  clippingPlanes?: THREE.Plane[];
}

export default function TerrainMesh({
  demData,
  wireframe = false,
  opacity = 1,
  verticalExaggeration = 5,
  onClick,
  clippingPlanes = [],
}: TerrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, material } = useMemo(() => {
    const { width, height, elevations, minLon, maxLon, minLat, maxLat } = demData;

    const geoWidth = (maxLon - minLon) * 111000 / 100000;
    const geoHeight = (maxLat - minLat) * 111000 / 100000;

    const geometry = new THREE.PlaneGeometry(geoWidth, geoHeight, width - 1, height - 1);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);

    for (let i = 0; i < positions.count; i++) {
      const x = Math.round(((positions.getX(i) + geoWidth / 2) / geoWidth) * (width - 1));
      const z = Math.round(((positions.getZ(i) + geoHeight / 2) / geoHeight) * (height - 1));
      const idx = z * width + x;
      const elevation = elevations[idx] || 0;

      positions.setY(i, elevation * verticalExaggeration);

      const color = getElevationColorThree(elevation, minElev, maxElev);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      wireframe,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1,
      clippingPlanes,
      clipShadows: true,
    });

    return { geometry, material };
  }, [demData, wireframe, opacity, verticalExaggeration, clippingPlanes]);

  const handleClick = (event: { point: THREE.Vector3 }) => {
    if (onClick) {
      onClick([event.point.x, event.point.y, event.point.z]);
    }
  };

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      receiveShadow
      castShadow
      onClick={handleClick}
    />
  );
}
