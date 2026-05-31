import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { ViewPreset, ToolMode } from '@/types';
import type { SceneParams } from '@/utils/geoUtils';
import { lonLatToSceneCoord, sceneCoordToLonLat } from '@/utils/geoUtils';

interface SceneControllerProps {
  sceneParams: SceneParams;
  viewPreset: ViewPreset;
  toolMode: ToolMode;
  selectedPosition?: [number, number, number] | null;
  onViewPresetChange?: (preset: ViewPreset) => void;
  onMouseMove?: (coords: [number, number, number] | null) => void;
  onTerrainClick?: (point: [number, number, number]) => void;
  onDoubleClick?: (point: [number, number, number]) => void;
}

const VIEW_PRESETS: Record<ViewPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  top: {
    position: [0, 100, 0.01],
    target: [0, 0, 0],
  },
  front: {
    position: [0, 20, 50],
    target: [0, 0, 0],
  },
  side: {
    position: [50, 20, 0],
    target: [0, 0, 0],
  },
  perspective: {
    position: [40, 40, 40],
    target: [0, 0, 0],
  },
};

export default function SceneController({
  sceneParams,
  viewPreset,
  toolMode,
  selectedPosition = null,
  onViewPresetChange,
  onMouseMove,
  onTerrainClick,
  onDoubleClick,
}: SceneControllerProps) {
  const { camera, gl, raycaster, scene, mouse } = useThree();
  const controlsRef = useRef<any>(null);
  const lastClickTime = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lonLatToScene = useCallback(
    (lon: number, lat: number, elevation: number): [number, number, number] => {
      return lonLatToSceneCoord(lon, lat, elevation, sceneParams);
    },
    [sceneParams]
  );

  const sceneToLonLat = useCallback(
    (x: number, y: number, z: number): [number, number, number] => {
      return sceneCoordToLonLat(x, y, z, sceneParams);
    },
    [sceneParams]
  );

  const getSceneCoordsFromMouse = useCallback((): [number, number, number] | null => {
    raycaster.setFromCamera(mouse, camera);

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, intersectPoint);

    if (intersectPoint) {
      return [intersectPoint.x, intersectPoint.y, intersectPoint.z];
    }

    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
      return [intersects[0].point.x, intersects[0].point.y, intersects[0].point.z];
    }

    return null;
  }, [raycaster, mouse, camera, scene]);

  useEffect(() => {
    const preset = VIEW_PRESETS[viewPreset];
    if (controlsRef.current && preset) {
      const [posX, posY, posZ] = preset.position;
      const [targetX, targetY, targetZ] = preset.target;

      controlsRef.current.setPosition(posX, posY, posZ);
      controlsRef.current.setTarget(targetX, targetY, targetZ);
      controlsRef.current.update();
    }
  }, [viewPreset]);

  useEffect(() => {
    if (selectedPosition && controlsRef.current) {
      const [x, y, z] = selectedPosition;
      controlsRef.current.setTarget(x, y, z);
      controlsRef.current.update();
    }
  }, [selectedPosition]);

  useFrame(() => {
    if (onMouseMove) {
      const coords = getSceneCoordsFromMouse();
      onMouseMove(coords);
    }
  });

  const handlePointerMissed = useCallback(
    (event: MouseEvent) => {
      const now = Date.now();
      const timeDiff = now - lastClickTime.current;

      const sceneCoords = getSceneCoordsFromMouse();

      if (timeDiff < 300) {
        if (clickTimer.current) {
          clearTimeout(clickTimer.current);
          clickTimer.current = null;
        }
        if (sceneCoords) {
          onDoubleClick?.(sceneCoords);
        }
      } else {
        if (event.button === 0 && toolMode !== 'navigate' && sceneCoords) {
          clickTimer.current = setTimeout(() => {
            onTerrainClick?.(sceneCoords);
          }, 300);
        }
      }

      lastClickTime.current = now;
    },
    [toolMode, onTerrainClick, onDoubleClick, getSceneCoordsFromMouse]
  );

  const getControlsEnableState = () => {
    switch (toolMode) {
      case 'navigate':
        return {
          enableRotate: true,
          enablePan: true,
          enableZoom: true,
        };
      case 'distance':
      case 'thickness':
        return {
          enableRotate: true,
          enablePan: false,
          enableZoom: true,
        };
      case 'annotate':
        return {
          enableRotate: true,
          enablePan: true,
          enableZoom: true,
        };
      default:
        return {
          enableRotate: true,
          enablePan: true,
          enableZoom: true,
        };
    }
  };

  const { enableRotate, enablePan, enableZoom } = getControlsEnableState();

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={200}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minPolarAngle={0.1}
        enableRotate={enableRotate}
        enablePan={enablePan}
        enableZoom={enableZoom}
        screenSpacePanning
        onPointerMissed={handlePointerMissed}
      />
    </>
  );
}
