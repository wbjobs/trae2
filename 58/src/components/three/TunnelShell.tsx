import { useMemo } from 'react';
import * as THREE from 'three';
import { useScene } from '@/store/scene';

export default function TunnelShell() {
  const clip = useScene((s) => s.clip);
  const totalLength = 120;
  const width = 10;
  const height = 5;

  const clippingPlane = useMemo(() => {
    if (!clip.enabled) return undefined;
    const normal =
      clip.axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : clip.axis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
    if (clip.invert) normal.negate();
    return new THREE.Plane(normal, -clip.position);
  }, [clip]);

  const planes = clippingPlane ? [clippingPlane] : undefined;

  const wallMat = (
    <meshStandardMaterial
      color="#1b2a4d"
      metalness={0.1}
      roughness={0.9}
      side={THREE.DoubleSide}
      transparent
      opacity={0.35}
      clippingPlanes={planes}
    />
  );

  return (
    <group>
      <mesh position={[totalLength / 2, 0, 0]}>
        <boxGeometry args={[totalLength, 0.2, width]} />
        {wallMat}
      </mesh>
      <mesh position={[totalLength / 2, height, 0]}>
        <boxGeometry args={[totalLength, 0.2, width]} />
        {wallMat}
      </mesh>
      <mesh position={[totalLength / 2, height / 2, -width / 2]}>
        <boxGeometry args={[totalLength, height, 0.2]} />
        {wallMat}
      </mesh>
      <mesh position={[totalLength / 2, height / 2, width / 2]}>
        <boxGeometry args={[totalLength, height, 0.2]} />
        {wallMat}
      </mesh>
      {Array.from({ length: Math.floor(totalLength / 15) }).map((_, i) => (
        <mesh key={i} position={[i * 15 + 7.5, height - 0.2, 0]}>
          <boxGeometry args={[0.3, 0.3, width - 0.4]} />
          <meshStandardMaterial color="#2b4073" metalness={0.4} roughness={0.6} clippingPlanes={planes} />
        </mesh>
      ))}
      {Array.from({ length: Math.floor(totalLength / 20) + 1 }).map((_, i) => (
        <pointLight
          key={`l${i}`}
          position={[i * 20, height - 0.4, 0]}
          color="#78a7ff"
          intensity={12}
          distance={18}
          decay={1.8}
        />
      ))}
    </group>
  );
}
