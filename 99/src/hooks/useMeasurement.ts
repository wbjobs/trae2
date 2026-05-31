import { useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, getRootState } from '@react-three/fiber';
import { useGeoStore } from '@/store';
import type { MeasurementResult, ToolMode } from '@/types';
import {
  createLineGeometry,
  createDashLineGeometry,
  createPointMarker,
  createTextSprite,
  calculateSpatialDistance,
  calculateHorizontalDistance,
  calculateVerticalDistance,
  calculatePointToPlaneDistance,
  calculateNormalFromPoints,
} from '@/utils/threeUtils';

interface UseMeasurementOptions {
  mode: ToolMode;
  terrainMesh?: THREE.Mesh | null;
  onMeasurementComplete?: (result: MeasurementResult) => void;
}

interface MeasurementState {
  points: [number, number, number][];
  tempObjects: THREE.Object3D[];
  selectedLayerId: string | null;
  selectedBoreholeId: string | null;
}

const initialState: MeasurementState = {
  points: [],
  tempObjects: [],
  selectedLayerId: null,
  selectedBoreholeId: null,
};

export function useMeasurement(options: UseMeasurementOptions) {
  const { mode, terrainMesh, onMeasurementComplete } = options;
  const { scene, camera } = useThree();
  const { addMeasurement, toolMode, geoLayers, boreholes, selectedFeature } = useGeoStore();
  
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  
  const stateRef = useRef<MeasurementState>({ ...initialState });
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const clearTempObjects = useCallback(() => {
    stateRef.current.tempObjects.forEach((obj) => {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    stateRef.current.tempObjects = [];
  }, [scene]);

  const resetMeasurement = useCallback(() => {
    clearTempObjects();
    stateRef.current = { ...initialState };
    setIsMeasuring(false);
    setCurrentDistance(null);
  }, [clearTempObjects]);

  useEffect(() => {
    if (toolMode !== 'distance' && toolMode !== 'thickness') {
      resetMeasurement();
    }
  }, [toolMode, resetMeasurement]);

  useEffect(() => {
    if (mode === 'thickness' && selectedFeature) {
      if (selectedFeature.type === 'layer') {
        stateRef.current.selectedLayerId = selectedFeature.id;
      } else if (selectedFeature.type === 'borehole') {
        stateRef.current.selectedBoreholeId = selectedFeature.id;
      }
    }
  }, [mode, selectedFeature]);

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

  const addTempPoint = useCallback((point: [number, number, number], color: string = '#e87c3e') => {
    const marker = createPointMarker(point, color, 0.12);
    scene.add(marker);
    stateRef.current.tempObjects.push(marker);
    
    const label = createTextSprite(
      `P${stateRef.current.points.length + 1}`,
      point,
      '#ffffff',
      14
    );
    scene.add(label);
    stateRef.current.tempObjects.push(label);
  }, [scene]);

  const updateTempLine = useCallback((endPoint: [number, number, number]) => {
    const existingLine = stateRef.current.tempObjects.find(
      (obj) => obj instanceof THREE.Line && obj.userData.isTempLine
    );
    if (existingLine) {
      scene.remove(existingLine);
      stateRef.current.tempObjects = stateRef.current.tempObjects.filter(
        (obj) => obj !== existingLine
      );
    }
    
    if (stateRef.current.points.length > 0) {
      const lastPoint = stateRef.current.points[stateRef.current.points.length - 1];
      const line = createDashLineGeometry([lastPoint, endPoint], '#e87c3e');
      line.userData.isTempLine = true;
      scene.add(line);
      stateRef.current.tempObjects.push(line);
      
      const distance = calculateSpatialDistance(lastPoint, endPoint);
      setCurrentDistance(distance);
    }
  }, [scene]);

  const handleDistanceClick = useCallback((event: React.MouseEvent) => {
    if (mode !== 'distance') return;
    
    const point = getIntersectionPoint(event);
    if (!point) return;
    
    setIsMeasuring(true);
    addTempPoint(point);
    stateRef.current.points.push(point);
    
    if (stateRef.current.points.length >= 2) {
      const p1 = stateRef.current.points[stateRef.current.points.length - 2];
      const p2 = stateRef.current.points[stateRef.current.points.length - 1];
      
      const spatialDist = calculateSpatialDistance(p1, p2);
      const horizontalDist = calculateHorizontalDistance(p1, p2);
      const verticalDist = calculateVerticalDistance(p1, p2);
      
      const finalLine = createLineGeometry([p1, p2], '#e87c3e');
      scene.add(finalLine);
      
      const midPoint: [number, number, number] = [
        (p1[0] + p2[0]) / 2,
        (p1[1] + p2[1]) / 2 + 0.3,
        (p1[2] + p2[2]) / 2,
      ];
      
      const distanceLabel = createTextSprite(
        `${spatialDist.toFixed(2)}m`,
        midPoint,
        '#e87c3e',
        14
      );
      scene.add(distanceLabel);
      
      const result: MeasurementResult = {
        type: 'distance',
        points: stateRef.current.points.slice(-2),
        value: spatialDist,
        horizontalDistance: horizontalDist,
        verticalDistance: verticalDist,
      };
      
      addMeasurement(result);
      onMeasurementComplete?.(result);
      
      stateRef.current.points = [];
      clearTempObjects();
      setIsMeasuring(false);
      setCurrentDistance(null);
    }
  }, [mode, getIntersectionPoint, addTempPoint, scene, addMeasurement, clearTempObjects, onMeasurementComplete]);

  const handleThicknessClick = useCallback((event: React.MouseEvent) => {
    if (mode !== 'thickness') return;
    
    const { selectedLayerId, selectedBoreholeId } = stateRef.current;
    
    if (!selectedLayerId) {
      if (selectedFeature?.type === 'layer') {
        stateRef.current.selectedLayerId = selectedFeature.id;
        return;
      }
      return;
    }
    
    if (!selectedBoreholeId) {
      if (selectedFeature?.type === 'borehole') {
        stateRef.current.selectedBoreholeId = selectedFeature.id;
      }
      return;
    }
    
    const geoLayer = geoLayers.find((l) => l.id === selectedLayerId);
    const borehole = boreholes.find((b) => b.id === selectedBoreholeId);
    
    if (!geoLayer || !borehole) return;
    
    const point = getIntersectionPoint(event);
    if (!point) return;
    
    const boreholePos: [number, number, number] = [0, borehole.elevation * 0.5, 0];
    
    const layerNormal: [number, number, number] = [0, 1, 0];
    const layerPoint: [number, number, number] = [point[0], point[1], point[2]];
    
    const thickness = calculatePointToPlaneDistance(boreholePos, layerPoint, layerNormal);
    
    const result: MeasurementResult = {
      type: 'thickness',
      points: [boreholePos, layerPoint],
      value: thickness,
    };
    
    const line = createLineGeometry([boreholePos, layerPoint], '#4299e1');
    scene.add(line);
    
    const midPoint: [number, number, number] = [
      (boreholePos[0] + layerPoint[0]) / 2,
      (boreholePos[1] + layerPoint[1]) / 2 + 0.3,
      (boreholePos[2] + layerPoint[2]) / 2,
    ];
    
    const thicknessLabel = createTextSprite(
      `厚度: ${thickness.toFixed(2)}m`,
      midPoint,
      '#4299e1',
      14
    );
    scene.add(thicknessLabel);
    
    addMeasurement(result);
    onMeasurementComplete?.(result);
    
    resetMeasurement();
  }, [mode, selectedFeature, geoLayers, boreholes, getIntersectionPoint, scene, addMeasurement, onMeasurementComplete, resetMeasurement]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isMeasuring || mode !== 'distance') return;
    if (stateRef.current.points.length === 0) return;
    
    const point = getIntersectionPoint(event);
    if (point) {
      updateTempLine(point);
    }
  }, [isMeasuring, mode, getIntersectionPoint, updateTempLine]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (mode === 'distance') {
      handleDistanceClick(event);
    } else if (mode === 'thickness') {
      handleThicknessClick(event);
    }
  }, [mode, handleDistanceClick, handleThicknessClick]);

  const exportMeasurements = useCallback(() => {
    const { measurements } = useGeoStore.getState();
    const data = measurements.map((m, i) => ({
      序号: i + 1,
      类型: m.type === 'distance' ? '距离量测' : '厚度量测',
      值: `${m.value.toFixed(3)}m`,
      水平距离: m.horizontalDistance ? `${m.horizontalDistance.toFixed(3)}m` : '-',
      垂直距离: m.verticalDistance ? `${m.verticalDistance.toFixed(3)}m` : '-',
      测量点: m.points.map((p) => `(${p.map(v => v.toFixed(3)).join(', ')})`).join(' -> '),
    }));
    
    const csvContent = [
      Object.keys(data[0]).join(','),
      ...data.map((row) => Object.values(row).join(',')),
    ].join('\n');
    
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `量测结果_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }, []);

  return {
    handleClick,
    handleMouseMove,
    resetMeasurement,
    exportMeasurements,
    isMeasuring,
    currentDistance,
    points: stateRef.current.points,
    selectedLayerId: stateRef.current.selectedLayerId,
    selectedBoreholeId: stateRef.current.selectedBoreholeId,
  };
}
