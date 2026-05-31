import * as THREE from 'three';
import { DeviceStatus } from '../../../../shared/types';

interface RainGaugeProps {
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

export function RainGauge({ position, status, value, isSelected, onClick }: RainGaugeProps) {
  const fillLevel = Math.min(1, Math.max(0, value / 100));

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.15, 0.2, 8]} />
        <meshStandardMaterial color="#607d8b" metalness={0.5} roughness={0.3} />
      </mesh>

      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.18, 0.15, 1.4, 16]} />
        <meshStandardMaterial color="#90a4ae" transparent opacity={0.4} />
      </mesh>

      <mesh position={[0, 0.25 + fillLevel * 0.7, 0]}>
        <cylinderGeometry args={[0.16, 0.135, fillLevel * 1.35, 16]} />
        <meshStandardMaterial color="#42a5f5" transparent opacity={0.7} />
      </mesh>

      <mesh position={[0, 1.65, 0]}>
        <cylinderGeometry args={[0.22, 0.18, 0.1, 16]} />
        <meshStandardMaterial color="#78909c" metalness={0.4} />
      </mesh>

      <mesh position={[0, 1.85, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
        <meshStandardMaterial color="#546e7a" />
      </mesh>

      <mesh position={[0, 2.1, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial 
          color={getStatusColor(status)} 
          emissive={getStatusColor(status)} 
          emissiveIntensity={isSelected ? 1 : 0.5} 
        />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.9, 0]}>
          <ringGeometry args={[0.45, 0.55, 32]} />
          <meshBasicMaterial color="#2196f3" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}
