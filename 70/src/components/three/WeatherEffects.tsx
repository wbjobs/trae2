import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WeatherType } from '../../../shared/types';
import { usePerformanceStore } from '../../store/usePerformanceStore';

interface WeatherEffectsProps {
  weather: WeatherType;
  intensity: number;
}

export function WeatherEffects({ weather, intensity }: WeatherEffectsProps) {
  const rainRef = useRef<THREE.Points>(null);
  const snowRef = useRef<THREE.Points>(null);
  const { config } = usePerformanceStore();
  const lastWeatherRef = useRef<WeatherType>(weather);

  const particleMultiplier = config.particleMultiplier;

  const rainGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const baseCount = 3000;
    const count = Math.floor(baseCount * particleMultiplier);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
      velocities[i] = 0.8 + Math.random() * 0.4;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
    return geometry;
  }, [particleMultiplier]);

  const snowGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const baseCount = 2000;
    const count = Math.floor(baseCount * particleMultiplier);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const offsets = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
      velocities[i] = 0.3 + Math.random() * 0.3;
      offsets[i] = Math.random() * Math.PI * 2;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
    geometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
    return geometry;
  }, [particleMultiplier]);

  useEffect(() => {
    if (weather !== lastWeatherRef.current) {
      console.log(`Weather changed: ${lastWeatherRef.current} -> ${weather}, intensity: ${intensity}`);
      lastWeatherRef.current = weather;
    }
  }, [weather, intensity]);

  const effectiveIntensity = Math.max(0.2, intensity);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    if (rainRef.current && (weather === 'rainy' || weather === 'stormy')) {
      const positions = rainRef.current.geometry.attributes.position.array as Float32Array;
      const velocities = rainRef.current.geometry.attributes.velocity.array as Float32Array;
      const speed = (weather === 'stormy' ? 60 : 35) * effectiveIntensity;
      const windOffset = weather === 'stormy' ? 15 : 5;
      
      for (let i = 0; i < positions.length; i += 3) {
        const vel = velocities[i / 3];
        positions[i + 1] -= speed * delta * vel;
        positions[i] += windOffset * delta * effectiveIntensity;
        
        if (positions[i + 1] < -5) {
          positions[i + 1] = 40;
          positions[i] = (Math.random() - 0.5) * 80;
          positions[i + 2] = (Math.random() - 0.5) * 80;
        }
        if (positions[i] > 40) {
          positions[i] = -40;
        }
      }
      
      rainRef.current.geometry.attributes.position.needsUpdate = true;
    }

    if (snowRef.current && (weather === 'snowy' || weather === 'frosty')) {
      const positions = snowRef.current.geometry.attributes.position.array as Float32Array;
      const velocities = snowRef.current.geometry.attributes.velocity.array as Float32Array;
      const offsets = snowRef.current.geometry.attributes.offset.array as Float32Array;
      const speed = (weather === 'snowy' ? 8 : 5) * effectiveIntensity;
      
      for (let i = 0; i < positions.length; i += 3) {
        const index = i / 3;
        const vel = velocities[index];
        const offset = offsets[index];
        
        positions[i + 1] -= speed * delta * vel;
        positions[i] += Math.sin(time * 2 + offset) * 3 * delta;
        positions[i + 2] += Math.cos(time * 1.5 + offset) * 2 * delta;
        
        if (positions[i + 1] < -5) {
          positions[i + 1] = 40;
          positions[i] = (Math.random() - 0.5) * 80;
          positions[i + 2] = (Math.random() - 0.5) * 80;
        }
      }
      
      snowRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  const showRain = weather === 'rainy' || weather === 'stormy';
  const showSnow = weather === 'snowy' || weather === 'frosty';

  return (
    <>
      {showRain && (
        <points ref={rainRef} geometry={rainGeometry}>
          <pointsMaterial 
            color={weather === 'stormy' ? '#7eb8da' : '#a0c4d4'} 
            size={0.15} 
            transparent 
            opacity={Math.min(0.8, 0.4 + effectiveIntensity * 0.4)}
            sizeAttenuation
            depthWrite={false}
          />
        </points>
      )}
      
      {showSnow && (
        <points ref={snowRef} geometry={snowGeometry}>
          <pointsMaterial 
            color="#ffffff" 
            size={0.25} 
            transparent 
            opacity={Math.min(0.9, 0.5 + effectiveIntensity * 0.4)}
            sizeAttenuation
            depthWrite={false}
          />
        </points>
      )}
    </>
  );
}

export function FogController({ weather, intensity }: WeatherEffectsProps) {
  const { scene } = useThree();
  
  useEffect(() => {
    let fogColor = '#87CEEB';
    let fogDensity = 0.02;
    let bgColor = '#87CEEB';
    
    switch (weather) {
      case 'sunny':
        fogColor = '#b8e0f0';
        fogDensity = 0.015;
        bgColor = '#87CEEB';
        break;
      case 'cloudy':
        fogColor = '#9ca3af';
        fogDensity = 0.03;
        bgColor = '#6b7280';
        break;
      case 'rainy':
        fogColor = '#4b5563';
        fogDensity = 0.045;
        bgColor = '#374151';
        break;
      case 'stormy':
        fogColor = '#1f2937';
        fogDensity = 0.06;
        bgColor = '#111827';
        break;
      case 'snowy':
        fogColor = '#e5e7eb';
        fogDensity = 0.07;
        bgColor = '#d1d5db';
        break;
      case 'frosty':
        fogColor = '#c4d4e0';
        fogDensity = 0.05;
        bgColor = '#94a3b8';
        break;
    }
    
    const effectiveDensity = fogDensity * (0.7 + intensity * 0.6);
    
    scene.fog = new THREE.FogExp2(fogColor, effectiveDensity);
    scene.background = new THREE.Color(bgColor);
  }, [weather, intensity, scene]);
  
  return null;
}

export function DynamicLighting({ weather, intensity }: WeatherEffectsProps) {
  const directionalRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const { config } = usePerformanceStore();

  useFrame(() => {
    if (directionalRef.current) {
      let intensityMultiplier = 1;
      let lightColor = '#ffffff';
      
      switch (weather) {
        case 'sunny':
          intensityMultiplier = 1.2;
          lightColor = '#fff8e7';
          break;
        case 'cloudy':
          intensityMultiplier = 0.7;
          lightColor = '#e8e8e8';
          break;
        case 'rainy':
          intensityMultiplier = 0.45;
          lightColor = '#c8d4e0';
          break;
        case 'stormy':
          intensityMultiplier = 0.25;
          lightColor = '#a0a8b0';
          break;
        case 'snowy':
          intensityMultiplier = 0.6;
          lightColor = '#f0f5fa';
          break;
        case 'frosty':
          intensityMultiplier = 0.55;
          lightColor = '#e0e8f0';
          break;
      }
      
      directionalRef.current.intensity = intensityMultiplier * (0.8 + intensity * 0.4));
      directionalRef.current.color.set(lightColor);
      directionalRef.current.castShadow = config.shadows;
    }
    
    if (ambientRef.current) {
      let ambientIntensity = 0.5;
      
      switch (weather) {
        case 'sunny':
          ambientIntensity = 0.6;
          break;
        case 'cloudy':
          ambientIntensity = 0.5;
          break;
        case 'rainy':
          ambientIntensity = 0.4;
          break;
        case 'stormy':
          ambientIntensity = 0.3;
          break;
        case 'snowy':
          ambientIntensity = 0.55;
          break;
        case 'frosty':
          ambientIntensity = 0.5;
          break;
      }
      
      ambientRef.current.intensity = ambientIntensity * (0.8 + intensity * 0.3));
    }
  });

  const shadowSize = config.shadows ? 2048 : 512;

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.5} />
      <directionalLight 
        ref={directionalRef}
        position={[10, 20, 10]} 
        intensity={1}
        castShadow={config.shadows}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
    </>
  );
}
