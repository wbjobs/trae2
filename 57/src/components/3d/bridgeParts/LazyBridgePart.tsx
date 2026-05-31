import { useState, useRef, useEffect, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface LazyBridgePartProps {
  id: string;
  position: [number, number, number];
  loadDistance?: number;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function LazyBridgePart({
  id,
  position,
  loadDistance = 40,
  children,
  fallback,
}: LazyBridgePartProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const { camera } = useThree();
  const positionRef = useRef(new THREE.Vector3(...position));
  const lastCheckRef = useRef(0);

  useFrame(() => {
    const now = performance.now();
    if (now - lastCheckRef.current < 200) return;
    lastCheckRef.current = now;

    const distance = camera.position.distanceTo(positionRef.current);
    const shouldBeVisible = distance < loadDistance;
    
    if (shouldBeVisible !== isVisible) {
      setIsVisible(shouldBeVisible);
      if (shouldBeVisible && !isLoaded) {
        setTimeout(() => setIsLoaded(true), 50);
      }
    }
  });

  if (!isVisible) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <Suspense fallback={fallback}>
      <group position={position}>
        {isLoaded ? children : fallback}
      </group>
    </Suspense>
  );
}

interface LODBridgePartProps {
  position: [number, number, number];
  lodDistances?: number[];
  children: React.ReactNode[];
}

export function LODBridgePart({
  position,
  lodDistances = [15, 30, 50],
  children,
}: LODBridgePartProps) {
  const meshRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [level, setLevel] = useState(0);
  const lastCheckRef = useRef(0);
  const positionRef = useRef(new THREE.Vector3(...position));

  useFrame(() => {
    const now = performance.now();
    if (now - lastCheckRef.current < 300) return;
    lastCheckRef.current = now;

    const distance = camera.position.distanceTo(positionRef.current);
    let newLevel = 0;
    for (let i = lodDistances.length - 1; i >= 0; i--) {
      if (distance > lodDistances[i]) {
        newLevel = i + 1;
        break;
      }
    }
    if (newLevel !== level && newLevel < children.length) {
      setLevel(newLevel);
    }
  });

  return (
    <group ref={meshRef} position={position}>
      {children[level]}
    </group>
  );
}

interface OptimizedMeshProps {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  position?: [number, number, number];
  onClick?: (event: any) => void;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export function OptimizedMesh({
  geometry,
  material,
  position = [0, 0, 0],
  onClick,
  castShadow = true,
  receiveShadow = true,
}: OptimizedMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const [isInView, setIsInView] = useState(true);
  const lastCheckRef = useRef(0);

  useFrame(() => {
    if (!meshRef.current) return;
    
    const now = performance.now();
    if (now - lastCheckRef.current < 500) return;
    lastCheckRef.current = now;

    const frustum = new THREE.Frustum();
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(matrix);

    const sphere = new THREE.Sphere();
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) {
      sphere.copy(geometry.boundingSphere);
      sphere.applyMatrix4(meshRef.current.matrixWorld);
      setIsInView(frustum.intersectsSphere(sphere));
    }
  });

  if (!isInView) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={position}
      onClick={onClick}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

export function usePerformanceMonitor() {
  const { gl } = useThree();
  const [fps, setFps] = useState(60);
  const [drawCalls, setDrawCalls] = useState(0);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);

  useFrame(() => {
    frameCountRef.current++;
    const now = performance.now();
    
    if (now - lastTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastTimeRef.current = now;
      
      const info = gl.info;
      setDrawCalls(info.render.calls);
    }
  });

  return { fps, drawCalls };
}
