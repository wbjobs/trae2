import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { OrbitControls } from 'three-stdlib';
import type { ViewPreset } from '@/types';
import { smoothCameraMove, focusOnFeature } from '@/utils/threeUtils';

interface ViewPresetConfig {
  position: [number, number, number];
  target: [number, number, number];
}

interface UseViewPresetsOptions {
  controlsRef?: React.RefObject<OrbitControls>;
  defaultDistance?: number;
  center?: [number, number, number];
}

const viewPresetConfigs: Record<ViewPreset, (distance: number, center: [number, number, number]) => ViewPresetConfig> = {
  top: (distance, center) => ({
    position: [center[0], center[1] + distance, center[2]],
    target: center,
  }),
  front: (distance, center) => ({
    position: [center[0], center[1] + distance * 0.3, center[2] + distance],
    target: center,
  }),
  side: (distance, center) => ({
    position: [center[0] + distance, center[1] + distance * 0.3, center[2]],
    target: center,
  }),
  perspective: (distance, center) => ({
    position: [
      center[0] + distance * 0.7,
      center[1] + distance * 0.6,
      center[2] + distance * 0.7,
    ],
    target: center,
  }),
};

export function useViewPresets(options: UseViewPresetsOptions = {}) {
  const { controlsRef, defaultDistance = 15, center = [0, 0, 0] } = options;
  const { camera, controls } = useThree();
  
  const isAnimating = useRef(false);
  const lastClickTime = useRef(0);
  const lastClickPosition = useRef<{ x: number; y: number } | null>(null);

  const goToView = useCallback(async (view: ViewPreset, duration: number = 1000) => {
    if (isAnimating.current) return;
    
    const orbitControls = controlsRef?.current || (controls as unknown as OrbitControls);
    if (!orbitControls) return;
    
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const config = viewPresetConfigs[view](defaultDistance, center);
    
    isAnimating.current = true;
    
    try {
      await smoothCameraMove(
        perspectiveCamera,
        orbitControls,
        config.position,
        config.target,
        duration
      );
    } finally {
      isAnimating.current = false;
    }
  }, [camera, controls, controlsRef, defaultDistance, center]);

  const focusOnSelected = useCallback(async (
    position: [number, number, number],
    distance?: number,
    duration: number = 1000
  ) => {
    if (isAnimating.current) return;
    
    const orbitControls = controlsRef?.current || (controls as unknown as OrbitControls);
    if (!orbitControls) return;
    
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    
    isAnimating.current = true;
    
    try {
      await focusOnFeature(
        perspectiveCamera,
        orbitControls,
        position,
        distance ?? defaultDistance * 0.6,
        duration
      );
    } finally {
      isAnimating.current = false;
    }
  }, [camera, controls, controlsRef, defaultDistance]);

  const resetView = useCallback(async (duration: number = 1000) => {
    await goToView('perspective', duration);
  }, [goToView]);

  const handleDoubleClick = useCallback((event: React.MouseEvent, getPosition?: (event: React.MouseEvent) => [number, number, number] | null) => {
    const now = performance.now();
    const DOUBLE_CLICK_DELAY = 300;
    const DOUBLE_CLICK_THRESHOLD = 5;
    
    if (lastClickPosition.current && 
        now - lastClickTime.current < DOUBLE_CLICK_DELAY &&
        Math.abs(event.clientX - lastClickPosition.current.x) < DOUBLE_CLICK_THRESHOLD &&
        Math.abs(event.clientY - lastClickPosition.current.y) < DOUBLE_CLICK_THRESHOLD) {
      
      if (getPosition) {
        const position = getPosition(event);
        if (position) {
          focusOnSelected(position);
        }
      }
      
      lastClickPosition.current = null;
      lastClickTime.current = 0;
    } else {
      lastClickPosition.current = { x: event.clientX, y: event.clientY };
      lastClickTime.current = now;
    }
  }, [focusOnSelected]);

  const zoomIn = useCallback((delta: number = 1) => {
    const orbitControls = controlsRef?.current || (controls as unknown as OrbitControls);
    if (!orbitControls) return;
    
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const direction = new THREE.Vector3();
    perspectiveCamera.getWorldDirection(direction);
    
    const zoomAmount = delta * 0.5;
    perspectiveCamera.position.addScaledVector(direction, zoomAmount);
    orbitControls.target.addScaledVector(direction, zoomAmount);
    orbitControls.update();
  }, [camera, controls, controlsRef]);

  const zoomOut = useCallback((delta: number = 1) => {
    zoomIn(-delta);
  }, [zoomIn]);

  return {
    goToView,
    focusOnSelected,
    resetView,
    handleDoubleClick,
    zoomIn,
    zoomOut,
    isAnimating,
  };
}
