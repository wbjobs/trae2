import { useMemo } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import type { MeasurementResult } from '@/types';

interface MeasurementLinesProps {
  measurements: MeasurementResult[];
  opacity?: number;
}

export default function MeasurementLines({
  measurements,
  opacity = 1,
}: MeasurementLinesProps) {
  const lineData = useMemo(() => {
    return measurements.map((measurement, mIndex) => {
      const points = measurement.points;
      const linePoints: THREE.Vector3[] = [];
      const endpointSpheres: { position: [number, number, number]; isFirst: boolean }[] = [];

      points.forEach((point, index) => {
        linePoints.push(new THREE.Vector3(point[0], point[1], point[2]));
        endpointSpheres.push({
          position: point,
          isFirst: index === 0,
        });
      });

      const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);

      const labels: { position: [number, number, number]; text: string }[] = [];

      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const midPoint: [number, number, number] = [
          (p1[0] + p2[0]) / 2,
          (p1[1] + p2[1]) / 2 + 0.5,
          (p1[2] + p2[2]) / 2,
        ];

        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const dz = p2[2] - p1[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        labels.push({
          position: midPoint,
          text: `${dist.toFixed(2)} m`,
        });
      }

      if (points.length > 2) {
        const totalMidPoint: [number, number, number] = [
          points.reduce((sum, p) => sum + p[0], 0) / points.length,
          Math.max(...points.map((p) => p[1])) + 1,
          points.reduce((sum, p) => sum + p[2], 0) / points.length,
        ];

        labels.push({
          position: totalMidPoint,
          text: `总计: ${measurement.value.toFixed(2)} m`,
        });
      }

      const lineColor = measurement.type === 'distance' ? 0x4ade80 : 0x60a5fa;

      return {
        id: `measurement-${mIndex}`,
        geometry,
        color: lineColor,
        endpointSpheres,
        labels,
      };
    });
  }, [measurements]);

  return (
    <group>
      {lineData.map((line) => (
        <group key={line.id}>
          <lineSegments geometry={line.geometry}>
            <lineBasicMaterial
              color={line.color}
              linewidth={3}
              transparent
              opacity={opacity}
            />
          </lineSegments>

          {line.endpointSpheres.map((sphere, sIndex) => (
            <mesh key={sIndex} position={sphere.position}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshStandardMaterial
                color={sphere.isFirst ? 0x22c55e : 0xef4444}
                emissive={line.color}
                emissiveIntensity={0.3}
              />
            </mesh>
          ))}

          {line.labels.map((label, lIndex) => (
            <Text
              key={lIndex}
              position={label.position}
              fontSize={0.5}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.03}
              outlineColor="#000000"
            >
              {label.text}
            </Text>
          ))}
        </group>
      ))}
    </group>
  );
}
