import { useRef, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, GizmoHelper, GizmoViewport, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { BridgeModel } from './BridgeModel';
import { DefectMarkers } from './DefectMarkers';
import { DroneInspection, ClimberInspection, RopeAccessInspection } from './InspectionAnimation';
import { useBridgeStore } from '../../store/useBridgeStore';
import type { DefectData } from '../../../shared';

function CameraController() {
  const { cameraPosition } = useBridgeStore();
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      minDistance={5}
      maxDistance={80}
      maxPolarAngle={Math.PI / 2 - 0.05}
      minPolarAngle={0.1}
      target={cameraPosition.target}
    />
  );
}

interface SceneContentProps {
  onMeshClick: (point: THREE.Vector3, normal: THREE.Vector3) => void;
  onMarkerClick: (defect: DefectData) => void;
  inspectionType: 'drone' | 'climber' | 'rope' | null;
  inspectionSpeed: number;
  onInspectionComplete?: () => void;
}

function SceneContent({ onMeshClick, onMarkerClick, inspectionType, inspectionSpeed, onInspectionComplete }: SceneContentProps) {
  const { viewMode } = useBridgeStore();

  return (
    <>
      <PerspectiveCamera 
        makeDefault 
        position={[20, 12, 20]} 
        fov={50}
        near={0.1}
        far={500}
      />
      <CameraController />

      <ambientLight intensity={0.5} color="#ffffff" />
      <directionalLight
        position={[15, 20, 15]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={0.1}
        shadow-camera-far={100}
      />
      <directionalLight position={[-15, 8, -15]} intensity={0.4} color="#60A5FA" />
      <pointLight position={[0, 10, 0]} intensity={0.6} color="#F59E0B" distance={50} />
      <pointLight position={[-18, 5, 0]} intensity={0.3} color="#3B82F6" distance={30} />
      <pointLight position={[18, 5, 0]} intensity={0.3} color="#3B82F6" distance={30} />

      <fog attach="fog" args={['#0F172A', 40, 120]} />

      <BridgeModel onMeshClick={onMeshClick} />
      <DefectMarkers onMarkerClick={onMarkerClick} />
      
      {inspectionType === 'drone' && (
        <DroneInspection
          active={true}
          type="drone"
          speed={inspectionSpeed}
          onComplete={onInspectionComplete}
        />
      )}
      {inspectionType === 'climber' && (
        <ClimberInspection
          active={true}
          type="climber"
          speed={inspectionSpeed}
          onComplete={onInspectionComplete}
        />
      )}
      {inspectionType === 'rope' && (
        <RopeAccessInspection
          active={true}
          type="rope"
          speed={inspectionSpeed}
          onComplete={onInspectionComplete}
        />
      )}

      <Grid
        position={[0, -6, 0]}
        args={[200, 200]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#475569"
        fadeDistance={60}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />

      <ContactShadows
        position={[0, -5.9, 0]}
        opacity={0.5}
        scale={80}
        blur={3}
        far={15}
        color="#000000"
      />

      <Environment preset="city" />

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#EF4444', '#22C55E', '#3B82F6']} labelColor="#94A3B8" />
      </GizmoHelper>

      {viewMode === 'stress' && (
        <EffectComposer>
          <Bloom 
            luminanceThreshold={0.15} 
            luminanceSmoothing={0.8} 
            height={400} 
            intensity={0.6} 
          />
          <Vignette offset={0.4} darkness={0.6} />
        </EffectComposer>
      )}
    </>
  );
}

interface SceneProps {
  onAddDefect?: (position: { x: number; y: number; z: number }) => void;
  onSelectDefect?: (defect: DefectData) => void;
  inspectionType?: 'drone' | 'climber' | 'rope' | null;
  inspectionSpeed?: number;
  onInspectionComplete?: () => void;
}

export function Scene({ 
  onAddDefect, 
  onSelectDefect, 
  inspectionType = null, 
  inspectionSpeed = 1,
  onInspectionComplete 
}: SceneProps) {
  const { toolMode } = useBridgeStore();
  const [isAdding, setIsAdding] = useState(false);
  const lastClickTime = useRef(0);

  const handleMeshClick = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    const now = Date.now();
    if (now - lastClickTime.current < 300) return;
    lastClickTime.current = now;

    if (toolMode === 'annotate' && !isAdding) {
      setIsAdding(true);
      
      const offset = normal.clone().multiplyScalar(0.1);
      const adjustedPoint = point.clone().add(offset);
      
      const clampedPoint = new THREE.Vector3(
        Math.max(-20, Math.min(20, adjustedPoint.x)),
        Math.max(-6, Math.min(12, adjustedPoint.y)),
        Math.max(-3, Math.min(3, adjustedPoint.z))
      );
      
      setTimeout(() => {
        setIsAdding(false);
        onAddDefect?.({ x: clampedPoint.x, y: clampedPoint.y, z: clampedPoint.z });
      }, 200);
    }
  }, [toolMode, isAdding, onAddDefect]);

  const handleMarkerClick = useCallback((defect: DefectData) => {
    onSelectDefect?.(defect);
  }, [onSelectDefect]);

  return (
    <Canvas
      shadows
      gl={{ 
        antialias: true, 
        alpha: false, 
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2
      }}
      style={{ background: 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)' }}
      onPointerMissed={() => useBridgeStore.getState().selectDefect(null)}
    >
      <SceneContent 
        onMeshClick={handleMeshClick} 
        onMarkerClick={handleMarkerClick}
        inspectionType={inspectionType}
        inspectionSpeed={inspectionSpeed}
        onInspectionComplete={onInspectionComplete}
      />
    </Canvas>
  );
}
