import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

interface FrustumCullingOptions {
  enabled?: boolean;
  updateInterval?: number;
  margin?: number;
}

interface CullableObject {
  id: string;
  position: THREE.Vector3;
  radius: number;
  visible: boolean;
}

export function useFrustumCulling(
  objects: CullableObject[],
  options: FrustumCullingOptions = {}
) {
  const { enabled = true, updateInterval = 1, margin = 1.0 } = options;

  const { camera } = useThree();
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const lastUpdate = useRef(0);
  const frameCount = useRef(0);

  const visibilityMap = useRef<Map<string, boolean>>(new Map());

  const boundingSpheres = useMemo(() => {
    return objects.map((obj) => ({
      id: obj.id,
      sphere: new THREE.Sphere(obj.position, obj.radius * margin),
    }));
  }, [objects, margin]);

  useFrame(() => {
    if (!enabled) return;

    frameCount.current++;
    if (frameCount.current % updateInterval !== 0) return;

    const now = performance.now();
    if (now - lastUpdate.current < 16) return;
    lastUpdate.current = now;

    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );

    frustum.setFromProjectionMatrix(projScreenMatrix);

    boundingSpheres.forEach(({ id, sphere }) => {
      const isVisible = frustum.intersectsSphere(sphere);
      visibilityMap.current.set(id, isVisible);
    });
  });

  const isVisible = (id: string): boolean => {
    return visibilityMap.current.get(id) ?? true;
  };

  const getVisibleObjects = () => {
    return objects.filter((obj) => visibilityMap.current.get(obj.id) ?? true);
  };

  const getVisibilityMap = () => visibilityMap.current;

  return {
    isVisible,
    getVisibleObjects,
    getVisibilityMap,
  };
}

export function useGroupFrustumCulling(
  groupRef: React.RefObject<THREE.Group>,
  options: FrustumCullingOptions = {}
) {
  const { enabled = true, updateInterval = 2 } = options;

  const { camera } = useThree();
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const frameCount = useRef(0);
  const boundingBox = useMemo(() => new THREE.Box3(), []);
  const boundingSphere = useMemo(() => new THREE.Sphere(), []);

  useFrame(() => {
    if (!enabled || !groupRef.current) return;

    frameCount.current++;
    if (frameCount.current % updateInterval !== 0) return;

    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );

    frustum.setFromProjectionMatrix(projScreenMatrix);

    boundingBox.setFromObject(groupRef.current);
    boundingBox.getBoundingSphere(boundingSphere);

    const groupVisible = frustum.intersectsSphere(boundingSphere);

    groupRef.current.visible = groupVisible;

    if (groupVisible) {
      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
          child.geometry.computeBoundingSphere();
          if (child.geometry.boundingSphere) {
            const sphere = child.geometry.boundingSphere.clone();
            sphere.applyMatrix4(child.matrixWorld);
            child.visible = frustum.intersectsSphere(sphere);
          }
        }
      });
    }
  });
}

export function useInstancedFrustumCulling(
  instancedMeshRef: React.RefObject<THREE.InstancedMesh>,
  instancePositions: THREE.Vector3[],
  instanceRadius: number = 1,
  options: FrustumCullingOptions = {}
) {
  const { enabled = true, updateInterval = 2, margin = 1.2 } = options;

  const { camera } = useThree();
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const frameCount = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const visibleInstances = useRef<number[]>([]);

  useFrame(() => {
    if (!enabled || !instancedMeshRef.current) return;

    frameCount.current++;
    if (frameCount.current % updateInterval !== 0) return;

    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );

    frustum.setFromProjectionMatrix(projScreenMatrix);

    const newVisible: number[] = [];
    const sphere = new THREE.Sphere(new THREE.Vector3(), instanceRadius * margin);

    instancePositions.forEach((pos, index) => {
      sphere.center.copy(pos);
      if (frustum.intersectsSphere(sphere)) {
        newVisible.push(index);
      }
    });

    visibleInstances.current = newVisible;

    if (instancedMeshRef.current.count !== newVisible.length) {
      newVisible.forEach((oldIndex, newIndex) => {
        instancedMeshRef.current!.getMatrixAt(oldIndex, dummy.matrix);
        instancedMeshRef.current!.setMatrixAt(newIndex, dummy.matrix);

        if (instancedMeshRef.current!.instanceColor) {
          const color = new THREE.Color();
          instancedMeshRef.current!.getColorAt(oldIndex, color);
          instancedMeshRef.current!.setColorAt(newIndex, color);
        }
      });

      instancedMeshRef.current.count = newVisible.length;
      instancedMeshRef.current.instanceMatrix.needsUpdate = true;
      if (instancedMeshRef.current.instanceColor) {
        instancedMeshRef.current.instanceColor.needsUpdate = true;
      }
    }
  });

  return {
    visibleCount: visibleInstances.current.length,
    visibleIndices: visibleInstances.current,
  };
}
