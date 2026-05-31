import * as THREE from 'three';
import { DeviceStatus } from '../../../../shared/types';

interface HygrometerProps {
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

export function Hygrometer({ position, status, value, isSelected, onClick }: HygrometerProps) {
  const moistureLevel = value / 100;

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.15, 8]} />
        <meshStandardMaterial color="#78909c" metalness={0.5} roughness={0.3} />
      </mesh>

      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.8, 16]} />
        <meshStandardMaterial color="#b0bec5" transparent opacity={0.7} />
      </mesh>

      <mesh position={[0, 0.15 + moistureLevel * 0.35, 0]}>
        <cylinderGeometry args={[0.13, 0.13, moistureLevel * 0.7, 16]} />
        <meshStandardMaterial color="#64b5f6" transparent opacity={0.6} />
      </mesh>

      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#546e7a" metalness={0.5} />
      </mesh>

      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial 
          color={getStatusColor(status)} 
          emissive={getStatusColor(status)} 
          emissiveIntensity={isSelected ? 1 : 0.5} 
        />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.5, 0]}>
          <ringGeometry args={[0.4, 0.5, 32]} />
          <meshBasicMaterial color="#2196f3" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}
