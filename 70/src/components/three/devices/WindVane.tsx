import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DeviceStatus } from '../../../../shared/types';

interface WindVaneProps {
  position: [number, number, number];
  status: DeviceStatus;
  durability: number;
  isSelected: boolean;
  onClick: () => void;
}

function getStatusColor(status: DeviceStatus): string {
  switch (status) {
    case 'normal': return '#4caf50';
    case 'warning': return '#ff9800';
    case 'fault': return '#f44336';
    case 'repairing': return '#2196f3';
    default: return '#9e9e9e';
  }
}

export function WindVane({ position, status, durability, isSelected, onClick }: WindVaneProps) {
  const vaneRef = useRef<THREE.Group>(null);
  const baseSpeed = status === 'fault' ? 0 : status === 'repairing' ? 0.3 : 1 * (durability / 100);

  useFrame(({ clock }) => {
    if (vaneRef.current) {
      vaneRef.current.rotation.y = Math.sin(clock.getElapsedTime() * baseSpeed) * 0.5;
    }
  });

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 1.5, 8]} />
        <meshStandardMaterial color="#37474f" metalness={0.5} roughness={0.3} />
      </mesh>

      <group ref={vaneRef} position={[0, 0.8, 0]}>
        <mesh position={[0.3, 0, 0]} rotation={[0, 0, Math.PI / 6]}>
          <coneGeometry args={[0.1, 0.4, 4]} />
          <meshStandardMaterial color="#f44336" metalness={0.3} />
        </mesh>
        <mesh position={[-0.2, 0, 0]}>
          <boxGeometry args={[0.4, 0.05, 0.02]} />
          <meshStandardMaterial color="#546e7a" metalness={0.3} />
        </mesh>
      </group>

      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial 
          color={getStatusColor(status)} 
          emissive={getStatusColor(status)} 
          emissiveIntensity={isSelected ? 1 : 0.5} 
        />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.8, 0]}>
          <ringGeometry args={[0.4, 0.5, 32]} />
          <meshBasicMaterial color="#2196f3" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}
