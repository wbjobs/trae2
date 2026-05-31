import * as THREE from 'three';
import { DeviceStatus } from '../../../../shared/types';

interface ThermometerProps {
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

export function Thermometer({ position, status, value, isSelected, onClick }: ThermometerProps) {
  const fillHeight = Math.max(0.1, Math.min(1, (value + 40) / 90));

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.3, 8]} />
        <meshStandardMaterial color="#607d8b" metalness={0.4} roughness={0.4} />
      </mesh>

      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.2, 8]} />
        <meshStandardMaterial color="#e3f2fd" transparent opacity={0.8} />
      </mesh>

      <mesh position={[0, 0.15 + fillHeight * 0.6, 0]}>
        <cylinderGeometry args={[0.025, 0.025, fillHeight * 1.2, 8]} />
        <meshStandardMaterial color="#f44336" emissive="#f44336" emissiveIntensity={0.3} />
      </mesh>

      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#f44336" emissive="#f44336" emissiveIntensity={0.3} />
      </mesh>

      <mesh position={[0, 1.4, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial 
          color={getStatusColor(status)} 
          emissive={getStatusColor(status)} 
          emissiveIntensity={isSelected ? 1 : 0.5} 
        />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.75, 0]}>
          <ringGeometry args={[0.35, 0.45, 32]} />
          <meshBasicMaterial color="#2196f3" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}
