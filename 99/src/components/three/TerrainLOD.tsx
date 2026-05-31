import { useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { DEMData } from '@/types';
import { getElevationColorThree } from '@/utils/geoUtils';
import { materialPool } from '@/utils/materialPool';

interface TerrainLODProps {
  demData: DEMData;
  wireframe?: boolean;
  opacity?: number;
  verticalExaggeration?: number;
  onClick?: (point: [number, number, number]) => void;
  lodDistances?: number[];
}

export default function TerrainLOD({
  demData,
  wireframe = false,
  opacity = 1,
  verticalExaggeration = 5,
  onClick,
  lodDistances = [10, 30, 60],
}: TerrainLODProps) {
  const lodRef = useRef<THREE.LOD>(null);

  const createTerrainGeometry = useCallback((resolution: number) => {
    const { width, height, elevations, minLon, maxLon, minLat, maxLat } = demData;

    const geoWidth = (maxLon - minLon) * 111000 / 100000;
    const geoHeight = (maxLat - minLat) * 111000 / 100000;

    const gridWidth = Math.max(4, Math.floor((width - 1) / resolution));
    const gridHeight = Math.max(4, Math.floor((height - 1) / resolution));

    const geometry = new THREE.PlaneGeometry(geoWidth, geoHeight, gridWidth, gridHeight);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);

    for (let i = 0; i < positions.count; i++) {
      const u = (positions.getX(i) + geoWidth / 2) / geoWidth;
      const v = (positions.getZ(i) + geoHeight / 2) / geoHeight;

      const x = Math.round(u * (width - 1));
      const z = Math.round(v * (height - 1));
      const idx = Math.min(Math.max(z * width + x, 0), elevations.length - 1);
      const elevation = elevations[idx] || 0;

      positions.setY(i, elevation * verticalExaggeration);

      const color = getElevationColorThree(elevation, minElev, maxElev);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    return geometry;
  }, [demData, verticalExaggeration]);

  const lodLevels = useMemo(() => {
    return [
      { distance: lodDistances[0], resolution: 1 },
      { distance: lodDistances[1], resolution: 2 },
      { distance: lodDistances[2], resolution: 4 },
    ].map((level) => ({
      ...level,
      geometry: createTerrainGeometry(level.resolution),
    }));
  }, [createTerrainGeometry, lodDistances]);

  const terrainMaterial = useMemo(() => {
    return materialPool.getTerrainMaterial(true, wireframe);
  }, [wireframe]);

  const handleClick = (event: { point: THREE.Vector3 }) => {
    if (onClick) {
      onClick([event.point.x, event.point.y, event.point.z]);
    }
  };

  return (
    <lOD ref={lodRef}>
      {lodLevels.map((level, index) => (
        <mesh
          key={`lod-${index}`}
          geometry={level.geometry}
          material={terrainMaterial}
          receiveShadow
          castShadow
          onClick={handleClick}
        />
      ))}
    </lOD>
  );
}
