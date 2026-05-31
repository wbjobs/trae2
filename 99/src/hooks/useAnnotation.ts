import { useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, getRootState } from '@react-three/fiber';
import { useGeoStore } from '@/store';
import { annotationApi } from '@/lib/api';
import type { Annotation } from '@/types';

type AnnotationType = Annotation['type'];
import {
  createPinMarker,
  createTextSprite,
} from '@/utils/threeUtils';

interface UseAnnotationOptions {
  enabled?: boolean;
  terrainMesh?: THREE.Mesh | null;
  onAnnotationCreated?: (annotation: Annotation) => void;
  onAnnotationUpdated?: (annotation: Annotation) => void;
  onAnnotationDeleted?: (id: string) => void;
}

interface PendingAnnotation {
  position: [number, number, number];
  type: AnnotationType;
}

export function useAnnotation(options: UseAnnotationOptions = {}) {
  const { enabled = true, terrainMesh, onAnnotationCreated, onAnnotationUpdated, onAnnotationDeleted } = options;
  const { scene, camera } = useThree();
  
  const { 
    annotations, 
    addAnnotation, 
    removeAnnotation,
    setCurrentCoordinates,
    currentCoordinates,
  } = useGeoStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const annotationObjects = useRef<Map<string, THREE.Object3D>>(new Map());

  const clearError = useCallback(() => setError(null), []);

  const getIntersectionPoint = useCallback((event: React.MouseEvent): [number, number, number] | null => {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.current.setFromCamera(mouse.current, camera);
    
    if (terrainMesh) {
      const intersects = raycaster.current.intersectObject(terrainMesh, false);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        return [point.x, point.y, point.z];
      }
    }
    
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    raycaster.current.ray.intersectPlane(plane, intersection);
    
    if (intersection.length() === 0) return null;
    return [intersection.x, intersection.y, intersection.z];
  }, [terrainMesh]);

  const createAnnotationObject = useCallback((annotation: Annotation): THREE.Object3D => {
    const { position, type, name, color } = annotation;
    
    const group = new THREE.Group();
    
    if (type === 'pin') {
      const pin = createPinMarker(position, color);
      group.add(pin);
      
      const label = createTextSprite(name, position, color, 12);
      group.add(label);
    } else if (type === 'label') {
      const label = createTextSprite(name, position, color, 14);
      group.add(label);
    } else if (type === 'area') {
      const marker = createPinMarker(position, color);
      group.add(marker);
      
      const label = createTextSprite(`[区域] ${name}`, position, color, 12);
      group.add(label);
    }
    
    group.userData.featureType = 'annotation';
    group.userData.featureId = annotation.id;
    group.userData.featureData = annotation;
    
    return group;
  }, []);

  const renderAnnotation = useCallback((annotation: Annotation) => {
    const existingObj = annotationObjects.current.get(annotation.id);
    if (existingObj) {
      scene.remove(existingObj);
    }
    
    const obj = createAnnotationObject(annotation);
    scene.add(obj);
    annotationObjects.current.set(annotation.id, obj);
  }, [scene, createAnnotationObject]);

  const removeAnnotationObject = useCallback((id: string) => {
    const obj = annotationObjects.current.get(id);
    if (obj) {
      scene.remove(obj);
      annotationObjects.current.delete(id);
    }
  }, [scene]);

  useEffect(() => {
    annotations.forEach((annotation) => {
      if (!annotationObjects.current.has(annotation.id)) {
        renderAnnotation(annotation);
      }
    });
    
    return () => {
      annotationObjects.current.forEach((obj) => {
        scene.remove(obj);
      });
      annotationObjects.current.clear();
    };
  }, [annotations, scene, renderAnnotation]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (!enabled) return;
    
    const position = getIntersectionPoint(event);
    if (!position) return;
    
    setPendingAnnotation({
      position,
      type: 'pin',
    });
    setIsModalOpen(true);
  }, [enabled, getIntersectionPoint]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!enabled) return;
    
    const position = getIntersectionPoint(event);
    if (position) {
      setCurrentCoordinates(position);
    }
  }, [enabled, getIntersectionPoint, setCurrentCoordinates]);

  const createAnnotation = useCallback(async (
    data: Omit<Annotation, 'id' | 'createdAt'>
  ): Promise<Annotation | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const newAnnotation = await annotationApi.create(data);
      
      addAnnotation(newAnnotation);
      renderAnnotation(newAnnotation);
      onAnnotationCreated?.(newAnnotation);
      
      return newAnnotation;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建标注失败';
      setError(errorMessage);
      
      const fallbackAnnotation: Annotation = {
        ...data,
        id: `ann-local-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      addAnnotation(fallbackAnnotation);
      renderAnnotation(fallbackAnnotation);
      onAnnotationCreated?.(fallbackAnnotation);
      
      return fallbackAnnotation;
    } finally {
      setIsLoading(false);
    }
  }, [addAnnotation, renderAnnotation, onAnnotationCreated]);

  const updateAnnotation = useCallback(async (
    id: string,
    data: Partial<Omit<Annotation, 'id' | 'createdAt'>>
  ): Promise<Annotation | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const updated = await annotationApi.update(id, data);
      
      const { annotations } = useGeoStore.getState();
      const index = annotations.findIndex(a => a.id === id);
      if (index !== -1) {
        const newAnnotations = [...annotations];
        newAnnotations[index] = updated;
        useGeoStore.setState({ annotations: newAnnotations });
      }
      
      renderAnnotation(updated);
      onAnnotationUpdated?.(updated);
      
      return updated;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '更新标注失败';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [renderAnnotation, onAnnotationUpdated]);

  const deleteAnnotation = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await annotationApi.delete(id);
      
      removeAnnotation(id);
      removeAnnotationObject(id);
      onAnnotationDeleted?.(id);
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除标注失败';
      setError(errorMessage);
      
      removeAnnotation(id);
      removeAnnotationObject(id);
      onAnnotationDeleted?.(id);
      
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [removeAnnotation, removeAnnotationObject, onAnnotationDeleted]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setPendingAnnotation(null);
    clearError();
  }, [clearError]);

  const confirmAnnotation = useCallback(async (
    data: Omit<Annotation, 'id' | 'createdAt' | 'position'> & { position?: [number, number, number] }
  ) => {
    if (!pendingAnnotation && !data.position) {
      closeModal();
      return;
    }
    
    const position = data.position || pendingAnnotation?.position || currentCoordinates || [0, 0, 0];
    
    await createAnnotation({
      ...data,
      position,
    });
    
    closeModal();
  }, [pendingAnnotation, currentCoordinates, createAnnotation, closeModal]);

  const handleSubmit = useCallback(async (formData: {
    name: string;
    description: string;
    type: AnnotationType;
    color: string;
  }) => {
    await confirmAnnotation(formData);
  }, [confirmAnnotation]);

  return {
    handleClick,
    handleMouseMove,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    closeModal,
    confirmAnnotation,
    handleSubmit,
    isModalOpen,
    pendingAnnotation,
    isLoading,
    error,
    currentPosition: currentCoordinates,
  };
}
