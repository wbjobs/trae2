import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TerrainData } from '../../types';

interface TerrainMeshProps {
  terrainData: TerrainData;
  opacity?: number;
  wireframe?: boolean;
  onPointClick?: (point: [number, number, number]) => void;
  clipPlanes?: THREE.Plane[];
  lodLevels?: number;
}

function generateOptimizedGeometry(
  terrainData: TerrainData,
  lodLevel: number = 0
): THREE.BufferGeometry {
  const { demData, resolution, bounds } = terrainData;
  const step = Math.pow(2, lodLevel);
  const gridSize = Math.max(2, Math.floor((resolution - 1) / step) + 1);

  const geo = new THREE.PlaneGeometry(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    gridSize - 1,
    gridSize - 1
  );

  geo.rotateX(-Math.PI / 2);

  const positions = geo.attributes.position;
  const colorArray = new Float32Array(positions.count * 3);
  const heights: number[] = [];

  const zRange = bounds.maxZ - bounds.minZ;
  const safeZRange = zRange > 0.001 ? zRange : 1;

  for (let i = 0; i < positions.count; i++) {
    const gridX = Math.floor(i % gridSize) * step;
    const gridY = Math.floor(i / gridSize) * step;

    const clampedX = Math.min(gridX, resolution - 1);
    const clampedY = Math.min(gridY, resolution - 1);

    const height = demData[clampedY]?.[clampedX] ?? 0;
    positions.setZ(i, height);
    heights.push(height);

    const normalizedHeight = (height - bounds.minZ) / safeZRange;
    const color = getHeightColorRGB(Math.max(0, Math.min(1, normalizedHeight)));

    colorArray[i * 3] = color[0] / 255;
    colorArray[i * 3 + 1] = color[1] / 255;
    colorArray[i * 3 + 2] = color[2] / 255;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();

  return geo;
}

export function TerrainMesh({
  terrainData,
  opacity = 1,
  wireframe = false,
  onPointClick,
  clipPlanes,
  lodLevels = 3,
}: TerrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const [currentLod, setCurrentLod] = useState(0);

  const geometries = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    const maxLod = Math.min(lodLevels, Math.floor(Math.log2(terrainData.resolution / 16)));
    
    for (let i = 0; i <= maxLod; i++) {
      geos.push(generateOptimizedGeometry(terrainData, i));
    }
    return geos;
  }, [terrainData, lodLevels]);

  const position = useMemo(() => ([
    (terrainData.bounds.maxX + terrainData.bounds.minX) / 2,
    0,
    (terrainData.bounds.maxY + terrainData.bounds.minY) / 2,
  ] as [number, number, number]), [terrainData.bounds]);

  const handleClick = (event: any) => {
    event.stopPropagation();
    if (onPointClick) {
      const point = event.point;
      onPointClick([point.x, point.y, point.z]);
    }
  };

  useEffect(() => {
    if (!meshRef.current) return;

    const calculateLod = () => {
      if (!meshRef.current) return 0;
      
      const meshPos = new THREE.Vector3(...position);
      const distance = camera.position.distanceTo(meshPos);
      
      if (distance < 80) return 0;
      if (distance < 150) return 1;
      if (distance < 250) return 2;
      return Math.min(3, geometries.length - 1);
    };

    let lastLod = -1;
    const interval = setInterval(() => {
      const newLod = calculateLod();
      if (newLod !== lastLod && geometries[newLod]) {
        lastLod = newLod;
        setCurrentLod(newLod);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [camera, geometries, position]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometries[currentLod] || geometries[0]}
      position={position}
      onClick={handleClick}
    >
      <meshStandardMaterial
        vertexColors
        transparent
        opacity={opacity}
        wireframe={wireframe}
        side={THREE.DoubleSide}
        roughness={0.8}
        metalness={0.1}
        clippingPlanes={clipPlanes}
      />
    </mesh>
  );
}

function getHeightColorRGB(normalizedHeight: number): [number, number, number] {
  const colors = [
    { pos: 0.0, color: [64, 96, 64] },
    { pos: 0.15, color: [90, 110, 70] },
    { pos: 0.3, color: [110, 130, 85] },
    { pos: 0.5, color: [160, 144, 96] },
    { pos: 0.65, color: [140, 135, 110] },
    { pos: 0.8, color: [170, 170, 170] },
    { pos: 1.0, color: [240, 240, 240] },
  ];

  let lower = colors[0];
  let upper = colors[colors.length - 1];

  for (let i = 0; i < colors.length - 1; i++) {
    if (normalizedHeight >= colors[i].pos && normalizedHeight <= colors[i + 1].pos) {
      lower = colors[i];
      upper = colors[i + 1];
      break;
    }
  }

  const range = upper.pos - lower.pos;
  const t = range > 0 ? (normalizedHeight - lower.pos) / range : 0;
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);

  return [
    Math.round(lerp(lower.color[0], upper.color[0], t)),
    Math.round(lerp(lower.color[1], upper.color[1], t)),
    Math.round(lerp(lower.color[2], upper.color[2], t)),
  ];
}

export function TerrainMeshHighDetail({
  terrainData,
  opacity = 1,
  wireframe = false,
  onPointClick,
  clipPlanes,
}: Omit<TerrainMeshProps, 'lodLevels'>) {
  return (
    <TerrainMesh
      terrainData={terrainData}
      opacity={opacity}
      wireframe={wireframe}
      onPointClick={onPointClick}
      clipPlanes={clipPlanes}
      lodLevels={0}
    />
  );
}
