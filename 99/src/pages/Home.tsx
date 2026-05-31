import { useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { useGeoStore } from '@/store';
import type { ViewPreset, Borehole, GeoLayer, Annotation, MeasurementResult } from '@/types';
import { calculateSceneCenter, lonLatToSceneCoord, sceneCoordToLonLat, distance3D } from '@/utils/geoUtils';
import type { SceneParams } from '@/utils/geoUtils';

import Toolbar from '@/components/Toolbar';
import LayerPanel from '@/components/LayerPanel';
import PropertyPanel from '@/components/PropertyPanel';
import SectionPanel from '@/components/SectionPanel';
import MeasurementResultComponent from '@/components/MeasurementResult';

import TerrainMesh from '@/components/three/TerrainMesh';
import BoreholePoints from '@/components/three/BoreholePoints';
import StratumLayers from '@/components/three/StratumLayers';
import MeasurementLines from '@/components/three/MeasurementLines';
import AnnotationMarkers from '@/components/three/AnnotationMarkers';
import SceneEnvironment from '@/components/three/SceneEnvironment';
import SceneController from '@/components/three/SceneController';
import SectionPlanes, { useSectionPlanes } from '@/components/three/SectionPlanes';
import SectionView from '@/components/three/SectionView';

const SCALE = 100000;
const VERTICAL_EXAGGERATION = 5;

interface SceneContentProps {
  demData: any;
  boreholes: any[];
  geoLayers: any[];
  annotations: any[];
  measurements: any[];
  layerVisibility: any;
  layerOpacity: any;
  selectedFeature: any;
  toolMode: any;
  sceneParams: any;
  sectionPlanes: any[];
  measurementPoints: any[];
  viewPreset: any;
  selectedPosition: any;
  visibleLayers: string[];
  onBoreholeSelect: (borehole: any) => void;
  onLayerSelect: (layer: any) => void;
  onAnnotationSelect: (annotation: any) => void;
  onViewPresetChange: (preset: any) => void;
  onMouseMove: (coords: any) => void;
  onTerrainClick: (point: any) => void;
  onDoubleClick: (point: any) => void;
}

function SceneContent({
  demData,
  boreholes,
  geoLayers,
  annotations,
  measurements,
  layerVisibility,
  layerOpacity,
  selectedFeature,
  toolMode,
  sceneParams,
  sectionPlanes,
  measurementPoints,
  viewPreset,
  selectedPosition,
  visibleLayers,
  onBoreholeSelect,
  onLayerSelect,
  onAnnotationSelect,
  onViewPresetChange,
  onMouseMove,
  onTerrainClick,
  onDoubleClick,
}: SceneContentProps) {
  const clippingPlanes = useSectionPlanes(sectionPlanes);

  return (
    <>
      <SceneEnvironment showGrid={true} gridSize={60} gridDivisions={60} />

      <SceneController
        sceneParams={sceneParams}
        viewPreset={viewPreset}
        toolMode={toolMode}
        selectedPosition={selectedPosition}
        onViewPresetChange={onViewPresetChange}
        onMouseMove={onMouseMove}
        onTerrainClick={onTerrainClick}
        onDoubleClick={onDoubleClick}
      />

      <SectionPlanes sectionPlanes={sectionPlanes} />

      <SectionView
        sectionPlanes={sectionPlanes}
        boreholes={boreholes}
        demData={demData}
        sceneParams={sceneParams}
      />

      {demData && layerVisibility.terrain && (
        <TerrainMesh
          demData={demData}
          wireframe={false}
          opacity={layerOpacity.terrain}
          verticalExaggeration={VERTICAL_EXAGGERATION}
          onClick={onTerrainClick}
          clippingPlanes={clippingPlanes}
        />
      )}

      {layerVisibility.boreholes && (
        <BoreholePoints
          boreholes={boreholes}
          sceneParams={sceneParams}
          selectedId={selectedFeature?.type === 'borehole' ? selectedFeature.id : null}
          opacity={layerOpacity.boreholes}
          onSelect={onBoreholeSelect}
          visibleLayers={visibleLayers}
          clippingPlanes={clippingPlanes}
        />
      )}

      {layerVisibility.geoLayers && (
        <StratumLayers
          geoLayers={geoLayers}
          boreholes={boreholes}
          sceneParams={sceneParams}
          opacity={layerOpacity.geoLayers}
          selectedId={selectedFeature?.type === 'layer' ? selectedFeature.id : null}
          onSelect={onLayerSelect}
          clippingPlanes={clippingPlanes}
        />
      )}

      {layerVisibility.annotations && (
        <AnnotationMarkers
          annotations={annotations}
          sceneParams={sceneParams}
          selectedId={selectedFeature?.type === 'annotation' ? selectedFeature.id : null}
          opacity={layerOpacity.annotations}
          onSelect={onAnnotationSelect}
        />
      )}

      {layerVisibility.measurements && (
        <>
          <MeasurementLines
            measurements={measurements}
            opacity={layerOpacity.measurements}
          />
          {measurementPoints.length > 0 && (
            <MeasurementLines
              measurements={[
                {
                  type: toolMode as 'distance' | 'thickness',
                  points: measurementPoints,
                  value: 0,
                },
              ]}
              opacity={0.7}
            />
          )}
        </>
      )}
    </>
  );
}

export default function Home() {
  const {
    boreholes,
    geoLayers,
    annotations,
    demData,
    toolMode,
    layerVisibility,
    layerOpacity,
    selectedFeature,
    measurements,
    sectionPlanes,
    boreholeLayerVisibility,
    setSelectedFeature,
    addMeasurement,
    setCurrentCoordinates,
    loadMockData,
  } = useGeoStore();

  const [viewPreset, setViewPreset] = useState<ViewPreset>('perspective');
  const [measurementPoints, setMeasurementPoints] = useState<[number, number, number][]>([]);

  useEffect(() => {
    loadMockData();
  }, [loadMockData]);

  const sceneParams: SceneParams = useMemo(() => {
    const [centerLon, centerLat] = calculateSceneCenter(boreholes);
    return {
      centerLon,
      centerLat,
      scale: SCALE,
      verticalExaggeration: VERTICAL_EXAGGERATION,
    };
  }, [boreholes]);

  const selectedPosition = useMemo((): [number, number, number] | null => {
    if (!selectedFeature) return null;

    switch (selectedFeature.type) {
      case 'borehole': {
        const bh = selectedFeature.data as Borehole;
        return lonLatToSceneCoord(bh.longitude, bh.latitude, bh.elevation, sceneParams);
      }
      case 'annotation': {
        const ann = selectedFeature.data as Annotation;
        return lonLatToSceneCoord(ann.position[0], ann.position[1], ann.position[2], sceneParams);
      }
      default:
        return null;
    }
  }, [selectedFeature, sceneParams]);

  const handleViewPresetChange = useCallback((preset: ViewPreset) => {
    setViewPreset(preset);
  }, []);

  const handleBoreholeSelect = useCallback(
    (borehole: Borehole) => {
      setSelectedFeature({
        type: 'borehole',
        id: borehole.id,
        data: borehole,
      });
    },
    [setSelectedFeature]
  );

  const handleLayerSelect = useCallback(
    (layer: GeoLayer) => {
      setSelectedFeature({
        type: 'layer',
        id: layer.id,
        data: layer,
      });
    },
    [setSelectedFeature]
  );

  const handleAnnotationSelect = useCallback(
    (annotation: Annotation) => {
      setSelectedFeature({
        type: 'annotation',
        id: annotation.id,
        data: annotation,
      });
    },
    [setSelectedFeature]
  );

  const handleMouseMove = useCallback(
    (coords: [number, number, number] | null) => {
      if (coords) {
        const [lon, lat, elev] = sceneCoordToLonLat(coords[0], coords[1], coords[2], sceneParams);
        setCurrentCoordinates([lon, lat, elev]);
      } else {
        setCurrentCoordinates(null);
      }
    },
    [sceneParams, setCurrentCoordinates]
  );

  const handleTerrainClick = useCallback(
    (point: [number, number, number]) => {
      if (toolMode === 'distance' || toolMode === 'thickness') {
        setMeasurementPoints((prev) => {
          const newPoints = [...prev, point];

          if (newPoints.length >= 2) {
            let totalValue = 0;
            for (let i = 1; i < newPoints.length; i++) {
              totalValue += distance3D(newPoints[i - 1], newPoints[i]);
            }

            const measurement: MeasurementResult = {
              type: toolMode,
              points: newPoints,
              value: totalValue,
            };

            if (toolMode === 'distance') {
              const dx = newPoints[newPoints.length - 1][0] - newPoints[0][0];
              const dz = newPoints[newPoints.length - 1][2] - newPoints[0][2];
              measurement.horizontalDistance = Math.sqrt(dx * dx + dz * dz);
              measurement.verticalDistance = Math.abs(
                newPoints[newPoints.length - 1][1] - newPoints[0][1]
              );
            }

            addMeasurement(measurement);
            return [];
          }

          return newPoints;
        });
      }
    },
    [toolMode, addMeasurement]
  );

  const handleDoubleClick = useCallback(
    (point: [number, number, number]) => {
      if (selectedFeature) {
        setSelectedFeature(null);
      } else if (measurementPoints.length > 0) {
        setMeasurementPoints([]);
      }
    },
    [selectedFeature, measurementPoints, setSelectedFeature]
  );

  const visibleLayers = useMemo(() => {
    return Object.entries(boreholeLayerVisibility)
      .filter(([_, visible]) => visible)
      .map(([name]) => name);
  }, [boreholeLayerVisibility]);

  useEffect(() => {
    if (toolMode === 'navigate') {
      setMeasurementPoints([]);
    }
  }, [toolMode]);

  return (
    <div className="h-screen flex flex-col bg-geo-dark">
      <Toolbar onViewChange={handleViewPresetChange} />

      <div className="flex-1 flex overflow-hidden">
        <LayerPanel />

        <div className="flex-1 relative">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-geo-text">加载中...</div>}>
            <Canvas
              shadows
              camera={{ position: [40, 40, 40], fov: 60, near: 0.1, far: 1000 }}
              gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', localClippingEnabled: true }}
              dpr={[1, 2]}
            >
              <SceneContent
                demData={demData}
                boreholes={boreholes}
                geoLayers={geoLayers}
                annotations={annotations}
                measurements={measurements}
                layerVisibility={layerVisibility}
                layerOpacity={layerOpacity}
                selectedFeature={selectedFeature}
                toolMode={toolMode}
                sceneParams={sceneParams}
                sectionPlanes={sectionPlanes}
                measurementPoints={measurementPoints}
                viewPreset={viewPreset}
                selectedPosition={selectedPosition}
                visibleLayers={visibleLayers}
                onBoreholeSelect={handleBoreholeSelect}
                onLayerSelect={handleLayerSelect}
                onAnnotationSelect={handleAnnotationSelect}
                onViewPresetChange={handleViewPresetChange}
                onMouseMove={handleMouseMove}
                onTerrainClick={handleTerrainClick}
                onDoubleClick={handleDoubleClick}
              />
            </Canvas>
          </Suspense>

          {toolMode === 'distance' && measurementPoints.length > 0 && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-geo-dark border border-geo-border rounded-lg px-4 py-2 text-geo-text text-sm">
              已选择 {measurementPoints.length} 个点，继续点击添加点或右键完成
            </div>
          )}

          <MeasurementResultComponent />
        </div>

        <SectionPanel />
        <PropertyPanel />
      </div>
    </div>
  );
}
