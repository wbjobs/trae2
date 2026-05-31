import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SectionPlane as SectionPlaneType } from '../../types';

interface SectionPlaneProps {
  plane: SectionPlaneType;
  size?: number;
  onDrag?: (origin: [number, number, number]) => void;
  onRotate?: (normal: [number, number, number]) => void;
  onSelect?: (id: string) => void;
  selected?: boolean;
}

export function SectionPlane({
  plane,
  size = 200,
  onDrag,
  onRotate,
  onSelect,
  selected = false,
}: SectionPlaneProps) {
  const meshRef = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  useFrame(() => {
    if (meshRef.current && selected) {
    }
  });

  if (!plane.visible) return null;

  const normal = new THREE.Vector3(...plane.normal).normalize();
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

  const handlePlaneClick = (e: any) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(plane.id);
    }
  };

  const handleCenterDrag = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleRotateX = (e: any) => {
    e.stopPropagation();
    if (onRotate) {
      const newNormal = new THREE.Vector3(...plane.normal);
      newNormal.applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 12);
      newNormal.normalize();
      onRotate([newNormal.x, newNormal.y, newNormal.z]);
    }
  };

  const handleRotateY = (e: any) => {
    e.stopPropagation();
    if (onRotate) {
      const newNormal = new THREE.Vector3(...plane.normal);
      newNormal.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 12);
      newNormal.normalize();
      onRotate([newNormal.x, newNormal.y, newNormal.z]);
    }
  };

  const handleRotateZ = (e: any) => {
    e.stopPropagation();
    if (onRotate) {
      const newNormal = new THREE.Vector3(...plane.normal);
      newNormal.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 12);
      newNormal.normalize();
      onRotate([newNormal.x, newNormal.y, newNormal.z]);
    }
  };

  return (
    <group
      ref={meshRef}
      position={plane.origin}
      quaternion={quaternion}
      onClick={handlePlaneClick}
    >
      <mesh>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          color={selected ? '#00CED1' : '#00CED1'}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      
      <mesh>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          color={selected ? '#00CED1' : '#00CED1'}
          transparent
          opacity={selected ? 0.6 : 0.4}
          wireframe
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        position={[0, 0, 0.5]}
        onClick={handleCenterDrag}
      >
        <sphereGeometry args={[4, 16, 16]} />
        <meshBasicMaterial color={selected ? '#FF6B6B' : '#FF6B6B'} />
      </mesh>

      <group position={[0, size / 2 + 15, 0]} onClick={handleRotateX}>
        <mesh>
          <torusGeometry args={[10, 2, 8, 32]} />
          <meshBasicMaterial color="#4ECDC4" />
        </mesh>
        <mesh position={[0, 15, 0]}>
          <sphereGeometry args={[3, 8, 8]} />
          <meshBasicMaterial color="#4ECDC4" />
        </mesh>
      </group>

      <group position={[size / 2 + 15, 0, 0]} onClick={handleRotateY}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[10, 2, 8, 32]} />
          <meshBasicMaterial color="#FFE66D" />
        </mesh>
        <mesh position={[15, 0, 0]}>
          <sphereGeometry args={[3, 8, 8]} />
          <meshBasicMaterial color="#FFE66D" />
        </mesh>
      </group>

      <group position={[0, 0, 15]} onClick={handleRotateZ}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[10, 2, 8, 32]} />
          <meshBasicMaterial color="#95E1D3" />
        </mesh>
        <mesh position={[0, 0, 15]}>
          <sphereGeometry args={[3, 8, 8]} />
          <meshBasicMaterial color="#95E1D3" />
        </mesh>
      </group>

      <group position={[size / 2 + 5, -size / 2 - 5, 0]}>
        <mesh>
          <planeGeometry args={[80, 20]} />
          <meshBasicMaterial color="#1a1a2e" transparent opacity={0.9} />
        </mesh>
      </group>
    </group>
  );
}

interface SectionAnalysisResultProps {
  points: [number, number, number][];
  color?: string;
}

export function SectionAnalysisResult({
  points,
  color = '#00CED1',
}: SectionAnalysisResultProps) {
  const lineRef = useRef<THREE.Line>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...p))
    );
    return geo;
  }, [points]);

  if (points.length < 2) return null;

  return (
    <group>
      <lineSegments ref={lineRef as any} geometry={geometry}>
        <lineBasicMaterial color={color} linewidth={3} />
      </lineSegments>

      {points.map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[1.5, 8, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

export function createSectionClipPlane(
  normal: [number, number, number],
  origin: [number, number, number]
): THREE.Plane {
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(
    new THREE.Vector3(...normal).normalize(),
    new THREE.Vector3(...origin)
  );
  return plane;
}

export function intersectPlaneWithTerrain(
  plane: THREE.Plane,
  terrainData: any,
  resolution: number = 200
): [number, number, number][] {
  const points: [number, number, number][] = [];
  const { bounds, demData } = terrainData;

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const normal = plane.normal.clone();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);

  if (Math.abs(normal.dot(up)) > 0.9) {
    right.set(1, 0, 0);
  } else {
    right.crossVectors(up, normal).normalize();
  }
  const forward = new THREE.Vector3().crossVectors(normal, right).normalize();

  const planePoint = new THREE.Vector3();
  plane.coplanarPoint(planePoint);

  const halfSize = Math.max(width, height);

  for (let i = 0; i <= resolution; i++) {
    const t = (i / resolution - 0.5) * halfSize * 2;
    const point = planePoint.clone().addScaledVector(right, t);

    const gridX = Math.floor(
      ((point.x - bounds.minX) / width) * terrainData.resolution
    );
    const gridY = Math.floor(
      ((point.y - bounds.minY) / height) * terrainData.resolution
    );

    if (
      gridX >= 0 &&
      gridX < terrainData.resolution &&
      gridY >= 0 &&
      gridY < terrainData.resolution
    ) {
      const terrainHeight = demData[gridY]?.[gridX] ?? 0;
      const projectedPoint = new THREE.Vector3(point.x, point.y, terrainHeight);
      
      const toPoint = projectedPoint.clone().sub(planePoint);
      const dist = toPoint.dot(normal);
      
      if (Math.abs(dist) < 5) {
        points.push([point.x, point.y, terrainHeight]);
      }
    }
  }

  return points;
}

export function getSectionIntersectionLine(
  planeNormal: [number, number, number],
  planeOrigin: [number, number, number],
  terrainData: any,
  numPoints: number = 300
): [number, number, number][] {
  const points: [number, number, number][] = [];
  const { bounds, demData, resolution } = terrainData;

  const normal = new THREE.Vector3(...planeNormal).normalize();
  const origin = new THREE.Vector3(...planeOrigin);

  const tangent1 = new THREE.Vector3();
  const tangent2 = new THREE.Vector3();
  
  if (Math.abs(normal.z) < 0.9) {
    tangent1.set(1, 0, 0);
    if (Math.abs(tangent1.dot(normal)) > 0.9) {
      tangent1.set(0, 1, 0);
    }
    tangent1.crossVectors(normal, tangent1).normalize();
  } else {
    tangent1.set(1, 0, 0);
  }
  tangent2.crossVectors(normal, tangent1).normalize();

  const centerX = (bounds.maxX + bounds.minX) / 2;
  const centerY = (bounds.maxY + bounds.minY) / 2;
  const halfWidth = (bounds.maxX - bounds.minX) / 2;
  const halfHeight = (bounds.maxY - bounds.minY) / 2;
  const sampleRadius = Math.max(halfWidth, halfHeight) * 1.5;

  for (let i = 0; i < numPoints; i++) {
    const t = (i / numPoints - 0.5) * sampleRadius * 2;
    
    const planePoint = origin.clone().addScaledVector(tangent1, t);
    
    const gridX = Math.floor(
      ((planePoint.x - bounds.minX) / (bounds.maxX - bounds.minX)) * resolution
    );
    const gridY = Math.floor(
      ((planePoint.y - bounds.minY) / (bounds.maxY - bounds.minY)) * resolution
    );

    if (
      gridX >= 0 &&
      gridX < resolution &&
      gridY >= 0 &&
      gridY < resolution
    ) {
      const terrainHeight = demData[gridY]?.[gridX] ?? 0;
      points.push([planePoint.x, planePoint.y, terrainHeight]);
    }
  }

  return points.filter((p, i, arr) => {
    if (i === 0 || i === arr.length - 1) return true;
    const prev = arr[i - 1];
    const next = arr[i + 1];
    const distPrev = Math.sqrt(
      Math.pow(p[0] - prev[0], 2) + Math.pow(p[1] - prev[1], 2)
    );
    const distNext = Math.sqrt(
      Math.pow(p[0] - next[0], 2) + Math.pow(p[1] - next[1], 2)
    );
    return distPrev > 0.5 || distNext > 0.5;
  });
}
