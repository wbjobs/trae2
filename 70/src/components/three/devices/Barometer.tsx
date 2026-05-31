import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DeviceStatus } from '../../../../shared/types';

interface BarometerProps {
  position: [number, number, number];
  status: DeviceStatus;
  value: number;
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

export function Barometer({ position, status, value, isSelected, onClick }: BarometerProps) {
  const needleRef = useRef<THREE.Mesh>(null);
  const targetRotation = ((value - 980) / 60 - 0.5) * Math.PI;

  useFrame(() => {
    if (needleRef.current) {
      needleRef.current.rotation.z = THREE.MathUtils.lerp(
        needleRef.current.rotation.z,
        targetRotation,
        0.05
      );
    }
  });

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 0.3, 8]} />
        <meshStandardMaterial color="#455a64" metalness={0.5} roughness={0.3} />
      </mesh>

      <mesh position={[0, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.05, 32]} />
        <meshStandardMaterial color="#37474f" metalness={0.6} />
      </mesh>

      <mesh position={[0, 0.83, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.02, 32]} />
        <meshStandardMaterial color="#eceff1" />
      </mesh>

      <mesh ref={needleRef} position={[0, 0.85, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.01, 0.18, 0.01]} />
        <meshStandardMaterial color="#d32f2f" />
      </mesh>

      <mesh position={[0, 0.86, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#263238" metalness={0.8} />
      </mesh>

      <mesh position={[0, 1.15, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial 
          color={getStatusColor(status)} 
          emissive={getStatusColor(status)} 
          emissiveIntensity={isSelected ? 1 : 0.5} 
        />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.8, 0]}>
          <ringGeometry args={[0.45, 0.55, 32]} />
          <meshBasicMaterial color="#2196f3" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}
