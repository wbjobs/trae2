import { useMemo } from 'react';
import * as THREE from 'three';
import { useScene } from '@/store/scene';

export default function ClipPlane() {
  const clip = useScene((s) => s.clip);

  const plane = useMemo(() => {
    const normal =
      clip.axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : clip.axis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
    return new THREE.Plane(normal, -clip.position);
  }, [clip.axis, clip.position]);

  if (!clip.enabled) return null;

  const helper = new THREE.PlaneHelper(plane, 30, 0x00d4ff);

  return <primitive object={helper} />;
}
