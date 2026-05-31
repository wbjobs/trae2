import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { EffectComposer, Bloom, SSAO } from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';

interface SceneEnvironmentProps {
  showGrid?: boolean;
  gridSize?: number;
  gridDivisions?: number;
  performanceMode?: 'low' | 'medium' | 'high' | 'ultra';
  enablePostProcessing?: boolean;
  antialiasLevel?: 0 | 1 | 2;
}

export default function SceneEnvironment({
  showGrid = true,
  gridSize = 50,
  gridDivisions = 50,
  performanceMode = 'high',
  enablePostProcessing = true,
  antialiasLevel = 1,
}: SceneEnvironmentProps) {
  const gridRef = useRef<THREE.GridHelper>(null);
  const { gl } = useThree();
  const [actualPerformance, setActualPerformance] = useState(performanceMode);

  useEffect(() => {
    if (gl) {
      gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

      const shadowMapSize = {
        low: 512,
        medium: 1024,
        high: 2048,
        ultra: 4096,
      }[actualPerformance];

      if (gl.shadowMap) {
        gl.shadowMap.enabled = actualPerformance !== 'low';
      }
    }
  }, [gl, actualPerformance]);

  const backgroundColor = useMemo(() => new THREE.Color(0x0a0a12), []);

  const lightingIntensity = useMemo(() => {
    return {
      low: { ambient: 0.3, directional: 0.8, point: 0.5 },
      medium: { ambient: 0.4, directional: 1.0, point: 0.7 },
      high: { ambient: 0.4, directional: 1.2, point: 0.8 },
      ultra: { ambient: 0.5, directional: 1.4, point: 1.0 },
    }[actualPerformance];
  }, [actualPerformance]);

  const shadowResolution = useMemo(() => {
    return {
      low: 512,
      medium: 1024,
      high: 2048,
      ultra: 4096,
    }[actualPerformance];
  }, [actualPerformance]);

  const postProcessingQuality = useMemo(() => {
    return {
      low: { bloomIntensity: 0.3, ssaoSamples: 9, ssaoRadius: 0.3 },
      medium: { bloomIntensity: 0.6, ssaoSamples: 15, ssaoRadius: 0.4 },
      high: { bloomIntensity: 1.0, ssaoSamples: 21, ssaoRadius: 0.5 },
      ultra: { bloomIntensity: 1.2, ssaoSamples: 31, ssaoRadius: 0.6 },
    }[actualPerformance];
  }, [actualPerformance]);

  return (
    <>
      <color attach="background" args={[backgroundColor]} />
      <fogExp2 attach="fog" args={[0x0a0a12, 0.015]} />

      <ambientLight intensity={lightingIntensity.ambient} color={0x88aaff} />

      <directionalLight
        position={[20, 30, 20]}
        intensity={lightingIntensity.directional}
        color={0xfff0e0}
        castShadow={actualPerformance !== 'low'}
        shadow-mapSize-width={shadowResolution}
        shadow-mapSize-height={shadowResolution}
        shadow-camera-far={100}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-50, 50, 50, -50, 0.1, 100]}
        />
      </directionalLight>

      {actualPerformance !== 'low' && (
        <>
          <directionalLight
            position={[-15, 10, -10]}
            intensity={lightingIntensity.directional * 0.3}
            color={0x6688ff}
          />

          <pointLight
            position={[0, 15, 0]}
            intensity={lightingIntensity.point}
            color={0xffaa66}
            distance={60}
            decay={2}
          />
        </>
      )}

      <hemisphereLight
        intensity={0.3}
        color={0x4488ff}
        groundColor={0x224466}
      />

      {showGrid && (
        <gridHelper
          ref={gridRef}
          args={[gridSize, gridDivisions, 0x334455, 0x223344]}
          position={[0, -0.01, 0]}
        />
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[gridSize, gridSize]} />
        <meshStandardMaterial
          color={0x0d1117}
          transparent
          opacity={0.9}
        />
      </mesh>

      {enablePostProcessing && actualPerformance !== 'low' && (
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            intensity={postProcessingQuality.bloomIntensity}
            mipmapBlur
          />
          {actualPerformance !== 'medium' && (
            <SSAO
              blendFunction={THREE.NormalBlending}
              intensity={0.5}
              distanceScaling
              samples={postProcessingQuality.ssaoSamples}
              radius={postProcessingQuality.ssaoRadius}
              luminanceInfluence={0.9}
              color={new THREE.Color(0x000000)}
              worldDistanceThreshold={10}
              worldDistanceFalloff={5}
              worldProximityThreshold={10}
              worldProximityFalloff={5}
            />
          )}
        </EffectComposer>
      )}
    </>
  );
}
