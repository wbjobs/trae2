import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useGeoStore } from '@/store';
import type { Borehole, GeoLayer, Annotation, SelectedFeature } from '@/types';

interface UseFeaturePickerOptions {
  enabled?: boolean;
  onHover?: (feature: SelectedFeature | null) => void;
  onClick?: (feature: SelectedFeature | null) => void;
}

interface PickerObject extends THREE.Object3D {
  userData: {
    featureType?: 'borehole' | 'layer' | 'annotation' | 'terrain';
    featureId?: string;
    featureData?: Borehole | GeoLayer | Annotation;
    originalMaterial?: THREE.Material | THREE.Material[];
    isHighlighted?: boolean;
  };
}

export function useFeaturePicker(options: UseFeaturePickerOptions = {}) {
  const { enabled = true, onHover, onClick } = options;
  const { camera, scene } = useThree();
  
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const hoveredObject = useRef<PickerObject | null>(null);
  const selectedObject = useRef<PickerObject | null>(null);
  
  const { setSelectedFeature, selectedFeature } = useGeoStore();

  const getPickableObjects = useCallback((): THREE.Object3D[] => {
    const objects: THREE.Object3D[] = [];
    
    scene.traverse((obj) => {
      const pickerObj = obj as PickerObject;
      if (pickerObj.userData.featureType) {
        objects.push(obj);
      }
    });
    
    return objects;
  }, [scene]);

  const restoreMaterial = useCallback((obj: PickerObject) => {
    if (obj.userData.originalMaterial) {
      const mesh = obj as THREE.Mesh;
      if (mesh.material) {
        mesh.material = obj.userData.originalMaterial;
      }
      obj.userData.isHighlighted = false;
    }
  }, []);

  const applyHighlight = useCallback((obj: PickerObject) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.material && !obj.userData.isHighlighted) {
      obj.userData.originalMaterial = mesh.material;
      
      const highlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xe87c3e,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.95,
      });
      
      mesh.material = highlightMaterial;
      obj.userData.isHighlighted = true;
    }
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!enabled) return;
    
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.current.setFromCamera(mouse.current, camera);
    
    const objects = getPickableObjects();
    const intersects = raycaster.current.intersectObjects(objects, true);
    
    if (intersects.length > 0) {
      let targetObj = intersects[0].object as PickerObject;
      
      while (targetObj.parent && !targetObj.userData.featureType) {
        targetObj = targetObj.parent as PickerObject;
      }
      
      if (targetObj.userData.featureType && targetObj !== hoveredObject.current) {
        if (hoveredObject.current && hoveredObject.current !== selectedObject.current) {
          restoreMaterial(hoveredObject.current);
        }
        
        if (targetObj !== selectedObject.current) {
          applyHighlight(targetObj);
        }
        
        hoveredObject.current = targetObj;
        
        if (targetObj.userData.featureType && targetObj.userData.featureId && targetObj.userData.featureData) {
          onHover?.({
            type: targetObj.userData.featureType as 'borehole' | 'layer' | 'annotation',
            id: targetObj.userData.featureId,
            data: targetObj.userData.featureData,
          });
        }
        
        canvas.style.cursor = 'pointer';
      }
    } else if (hoveredObject.current) {
      if (hoveredObject.current !== selectedObject.current) {
        restoreMaterial(hoveredObject.current);
      }
      hoveredObject.current = null;
      onHover?.(null);
      canvas.style.cursor = 'grab';
    }
  }, [enabled, camera, getPickableObjects, onHover, restoreMaterial, applyHighlight]);

  const handleClick = useCallback((event: MouseEvent) => {
    if (!enabled) return;
    
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.current.setFromCamera(mouse.current, camera);
    
    const objects = getPickableObjects();
    const intersects = raycaster.current.intersectObjects(objects, true);
    
    if (intersects.length > 0) {
      let targetObj = intersects[0].object as PickerObject;
      
      while (targetObj.parent && !targetObj.userData.featureType) {
        targetObj = targetObj.parent as PickerObject;
      }
      
      if (targetObj.userData.featureType && targetObj.userData.featureId && targetObj.userData.featureData) {
        if (selectedObject.current && selectedObject.current !== targetObj) {
          restoreMaterial(selectedObject.current);
        }
        
        selectedObject.current = targetObj;
        applyHighlight(targetObj);
        
        const feature: SelectedFeature = {
          type: targetObj.userData.featureType as 'borehole' | 'layer' | 'annotation',
          id: targetObj.userData.featureId,
          data: targetObj.userData.featureData,
        };
        
        setSelectedFeature(feature);
        onClick?.(feature);
      }
    } else {
      if (selectedObject.current) {
        restoreMaterial(selectedObject.current);
        selectedObject.current = null;
      }
      setSelectedFeature(null);
      onClick?.(null);
    }
  }, [enabled, camera, getPickableObjects, setSelectedFeature, onClick, restoreMaterial, applyHighlight]);

  useEffect(() => {
    if (!selectedFeature && selectedObject.current) {
      restoreMaterial(selectedObject.current);
      selectedObject.current = null;
    }
  }, [selectedFeature, restoreMaterial]);

  const getIntersectionPoint = useCallback((event: MouseEvent, planeY: number = 0): [number, number, number] | null => {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.current.setFromCamera(mouse.current, camera);
    
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const intersection = new THREE.Vector3();
    raycaster.current.ray.intersectPlane(plane, intersection);
    
    if (intersection.length() === 0) return null;
    
    return [intersection.x, intersection.y, intersection.z];
  }, [camera]);

  const intersectTerrain = useCallback((event: MouseEvent, terrainMesh: THREE.Mesh): THREE.Intersection | null => {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.current.setFromCamera(mouse.current, camera);
    
    const intersects = raycaster.current.intersectObject(terrainMesh, false);
    return intersects.length > 0 ? intersects[0] : null;
  }, [camera]);

  return {
    handleMouseMove,
    handleClick,
    getIntersectionPoint,
    intersectTerrain,
    hoveredObject,
    selectedObject,
  };
}
