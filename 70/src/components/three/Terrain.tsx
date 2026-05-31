import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Terrain() {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = new THREE.PlaneGeometry(50, 50, 64, 64);
  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = Math.sin(x * 0.3) * Math.cos(y * 0.3) * 2 + 
              Math.sin(x * 0.1 + 1) * Math.cos(y * 0.15) * 3 +
              Math.random() * 0.3;
    positions.setZ(i, z);
  }

  geometry.computeVertexNormals();

  return (
    <mesh 
      ref={meshRef} 
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[0, -1, 0]}
      receiveShadow
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial 
        color="#4a7c59" 
        roughness={0.9}
        metalness={0.1}
      />
    </mesh>
  );
}

export function MountainBackground() {
  return (
    <group>
      <mesh position={[-20, 5, -30]} rotation={[0, 0.3, 0]}>
        <coneGeometry args={[15, 20, 8]} />
        <meshStandardMaterial color="#5d6e7c" roughness={1} />
      </mesh>
      <mesh position={[25, 3, -35]} rotation={[0, -0.2, 0]}>
        <coneGeometry args={[18, 25, 8]} />
        <meshStandardMaterial color="#4a5d6e" roughness={1} />
      </mesh>
      <mesh position={[0, 8, -50]}>
        <coneGeometry args={[25, 30, 8]} />
        <meshStandardMaterial color="#3d4f5e" roughness={1} />
      </mesh>
    </group>
  );
}

export function Rocks() {
  return (
    <group>
      <mesh position={[5, -0.5, 5]} scale={[1.5, 1, 1.2]}>
        <dodecahedronGeometry args={[1]} />
        <meshStandardMaterial color="#6b7280" roughness={0.9} />
      </mesh>
      <mesh position={[-6, -0.3, 3]} scale={[1, 0.8, 1]}>
        <dodecahedronGeometry args={[0.8]} />
        <meshStandardMaterial color="#78716c" roughness={0.9} />
      </mesh>
      <mesh position={[3, -0.2, -4]} scale={[1.2, 0.7, 1]}>
        <dodecahedronGeometry args={[0.7]} />
        <meshStandardMaterial color="#6b7280" roughness={0.9} />
      </mesh>
    </group>
  );
}
