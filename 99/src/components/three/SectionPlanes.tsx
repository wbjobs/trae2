import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { SectionPlane } from '@/types';

interface SectionPlanesProps {
  sectionPlanes: SectionPlane[];
}

export function useSectionPlanes(sectionPlanes: SectionPlane[]): THREE.Plane[] {
  return useMemo(() => {
    return sectionPlanes
      .filter((p) => p.visible)
      .map((plane) => {
        const normal = new THREE.Vector3(...plane.normal).normalize();
        const position = new THREE.Vector3(...plane.position);
        const constant = -normal.dot(position);
        return new THREE.Plane(normal, constant);
      });
  }, [sectionPlanes]);
}

export function SectionPlanes({ sectionPlanes }: SectionPlanesProps) {
  const { gl } = useThree();

  useMemo(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  const visiblePlanes = useMemo(
    () => sectionPlanes.filter((p) => p.visible),
    [sectionPlanes]
  );

  return (
    <group>
      {visiblePlanes.map((plane) => (
        <SectionPlaneVisual key={plane.id} plane={plane} />
      ))}
    </group>
  );
}

interface SectionPlaneVisualProps {
  plane: SectionPlane;
}

function SectionPlaneVisual({ plane }: SectionPlaneVisualProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { position, quaternion, geometry } = useMemo(() => {
    const normal = new THREE.Vector3(...plane.normal).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    
    if (Math.abs(normal.dot(up)) > 0.99) {
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    } else {
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    }

    const size = 60;
    const geometry = new THREE.PlaneGeometry(size, size);

    return {
      position: new THREE.Vector3(...plane.position),
      quaternion,
      geometry,
    };
  }, [plane]);

  return (
    <mesh
      ref={meshRef}
      position={position}
      quaternion={quaternion}
      geometry={geometry}
    >
      <meshBasicMaterial
        color={plane.color}
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export default SectionPlanes;
