import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DeviceStatus } from '../../../../shared/types';

interface AnemometerProps {
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

export function Anemometer({ position, status, durability, isSelected, onClick }: AnemometerProps) {
  const rotorRef = useRef<THREE.Group>(null);
  const speed = status === 'fault' ? 0.2 : status === 'repairing' ? 0.5 : 2 * (durability / 100);

  useFrame((_, delta) => {
    if (rotorRef.current) {
      rotorRef.current.rotation.y += delta * speed * 3;
    }
  });

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 2, 8]} />
        <meshStandardMaterial color="#37474f" metalness={0.5} roughness={0.3} />
      </mesh>
      
      <group ref={rotorRef} position={[0, 1, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
            <boxGeometry args={[0.05, 0.6, 0.02]} />
            <meshStandardMaterial color="#546e7a" metalness={0.3} />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#455a64" metalness={0.6} />
        </mesh>
      </group>

      <mesh position={[0, 2.1, 0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial 
          color={getStatusColor(status)} 
          emissive={getStatusColor(status)} 
          emissiveIntensity={isSelected ? 1 : 0.5} 
        />
      </mesh>

      {isSelected && (
        <mesh position={[0, 1, 0]}>
          <ringGeometry args={[0.5, 0.6, 32]} />
          <meshBasicMaterial color="#2196f3" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}
