import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../../store';
import { ToolMode, SectionPlane as SectionPlaneType } from '../../types';
import { TerrainMesh } from '../TerrainModeling/TerrainMesh';
import { GeologyLayerManager } from '../GeologyStructure/GeologyLayerMesh';
import { SectionPlane, createSectionClipPlane } from '../SectionAnalysis/SectionPlane';
import {
  MeasurementGroup,
  PointMarker,
  calculateDistance,
  calculateAngle,
  calculateHeightDifference,
} from '../Measurement/MeasurementTools';

interface SceneContentProps {
  selectedPlaneId: string | null;
  onSelectPlane: (id: string | null) => void;
  layerOpacities: Record<string, number>;
  globalLayerOpacity: number;
  terrainOpacity: number;
}

function SceneContent({
  selectedPlaneId,
  onSelectPlane,
  layerOpacities,
  globalLayerOpacity,
  terrainOpacity,
}: SceneContentProps) {
  const {
    terrainData,
    geologyLayers,
    sectionPlanes,
    measurements,
    toolMode,
    selectedPoint,
    setSelectedPoint,
    addMeasurement,
    setQueryResult,
    addSectionPlane,
    updateSectionPlane,
  } = useAppStore();

  const [measurePoints, setMeasurePoints] = useState<[number, number, number][]>([]);
  const [sectionPoints, setSectionPoints] = useState<[number, number, number][]>([]);

  const clipPlanes = useMemo(() => {
    return sectionPlanes
      .filter(p => p.visible)
      .map(p => createSectionClipPlane(p.normal, p.origin));
  }, [sectionPlanes]);

  const handleTerrainClick = useCallback(
    (point: [number, number, number]) => {
      onSelectPlane(null);
      setSelectedPoint(point);

      if (toolMode === 'query') {
        const depth = 10;
        const layer = geologyLayers.find(
          (l) => depth >= l.depth && depth < l.depth + l.thickness
        );
        if (layer) {
          setQueryResult({
            position: point,
            layerName: layer.name,
            rockType: layer.rockType,
            depth: depth,
            properties: layer.properties,
          });
        }
      }

      if (toolMode === 'section') {
        const newPoints = [...sectionPoints, point];
        setSectionPoints(newPoints);

        if (newPoints.length >= 3) {
          const p1 = new THREE.Vector3(...newPoints[0]);
          const p2 = new THREE.Vector3(...newPoints[1]);
          const p3 = new THREE.Vector3(...newPoints[2]);

          const v1 = new THREE.Vector3().subVectors(p2, p1);
          const v2 = new THREE.Vector3().subVectors(p3, p1);
          const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();

          if (!isNaN(normal.x) && !isNaN(normal.y) && !isNaN(normal.z) && normal.length() > 0.1) {
            const center = new THREE.Vector3()
              .addVectors(p1, p2)
              .add(p3)
              .divideScalar(3);

            const newPlane: SectionPlaneType = {
              id: 'plane-' + Date.now(),
              name: `剖切平面 ${sectionPlanes.length + 1}`,
              normal: [normal.x, normal.y, normal.z],
              origin: [center.x, center.y, center.z],
              visible: true,
            };
            addSectionPlane(newPlane);
            onSelectPlane(newPlane.id);
          }

          setSectionPoints([]);
        }
      }

      if (
        toolMode === 'measure-distance' ||
        toolMode === 'measure-angle' ||
        toolMode === 'measure-height'
      ) {
        const newPoints = [...measurePoints, point];
        setMeasurePoints(newPoints);

        if (toolMode === 'measure-distance' && newPoints.length >= 2) {
          const dist = calculateDistance(newPoints[0], newPoints[1]);
          addMeasurement({
            id: 'meas-' + Date.now(),
            type: 'distance',
            points: [newPoints[0], newPoints[1]],
            value: dist,
            unit: 'm',
            label: `距离: ${dist.toFixed(2)}m`,
          });
          setMeasurePoints([]);
        }

        if (toolMode === 'measure-angle' && newPoints.length >= 3) {
          const angle = calculateAngle(newPoints[0], newPoints[1], newPoints[2]);
          addMeasurement({
            id: 'meas-' + Date.now(),
            type: 'angle',
            points: [newPoints[0], newPoints[1], newPoints[2]],
            value: angle,
            unit: '°',
            label: `角度: ${angle.toFixed(2)}°`,
          });
          setMeasurePoints([]);
        }

        if (toolMode === 'measure-height' && newPoints.length >= 2) {
          const height = calculateHeightDifference(newPoints[0], newPoints[1]);
          addMeasurement({
            id: 'meas-' + Date.now(),
            type: 'height',
            points: [newPoints[0], newPoints[1]],
            value: height,
            unit: 'm',
            label: `高差: ${height.toFixed(2)}m`,
          });
          setMeasurePoints([]);
        }
      }
    },
    [
      toolMode,
      measurePoints,
      sectionPoints,
      geologyLayers,
      sectionPlanes.length,
      onSelectPlane,
      setSelectedPoint,
      addMeasurement,
      setQueryResult,
      addSectionPlane,
    ]
  );

  useEffect(() => {
    if (toolMode === 'navigate' || toolMode === 'query') {
      setMeasurePoints([]);
      setSectionPoints([]);
    }
  }, [toolMode]);

  const handlePlaneRotate = useCallback(
    (planeId: string, normal: [number, number, number]) => {
      updateSectionPlane(planeId, { normal });
    },
    [updateSectionPlane]
  );

  const handlePlaneDrag = useCallback(
    (planeId: string, origin: [number, number, number]) => {
      updateSectionPlane(planeId, { origin });
    },
    [updateSectionPlane]
  );

  const getLayerOpacity = (layerId: string) => {
    return layerOpacities[layerId] ?? globalLayerOpacity;
  };

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[100, 100, 50]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-50, 80, -50]} intensity={0.4} />
      <hemisphereLight args={['#87CEEB', '#362d26', 0.3]} />

      <fog attach="fog" args={['#0a0a1a', 200, 600]} />

      {terrainData && (
        <TerrainMesh
          terrainData={terrainData}
          onPointClick={handleTerrainClick}
          opacity={terrainOpacity}
          clipPlanes={clipPlanes}
          lodLevels={3}
        />
      )}

      {terrainData && (
        <GeologyLayerManager
          layers={geologyLayers}
          terrainData={terrainData}
          layerOpacities={Object.fromEntries(
            geologyLayers.map(l => [l.id, getLayerOpacity(l.id)])
          )}
          clipPlanes={clipPlanes}
          quality="medium"
        />
      )}

      {sectionPlanes.map((plane) => (
        <SectionPlane
          key={plane.id}
          plane={plane}
          size={250}
          selected={selectedPlaneId === plane.id}
          onSelect={() => onSelectPlane(plane.id)}
          onRotate={(normal) => handlePlaneRotate(plane.id, normal)}
          onDrag={(origin) => handlePlaneDrag(plane.id, origin)}
        />
      ))}

      <MeasurementGroup measurements={measurements} />

      {measurePoints.map((point, index) => (
        <PointMarker
          key={index}
          position={point}
          label={`P${index + 1}`}
          color="#00CED1"
          showLabel
        />
      ))}

      {sectionPoints.map((point, index) => (
        <PointMarker
          key={`section-${index}`}
          position={point}
          label={`S${index + 1}`}
          color="#FF6B6B"
          showLabel
        />
      ))}

      {selectedPoint && toolMode !== 'navigate' && (
        <PointMarker position={selectedPoint} color="#FFE66D" />
      )}

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={40}
        maxDistance={500}
        maxPolarAngle={Math.PI / 2 - 0.05}
        enablePan={true}
        panSpeed={1.5}
        rotateSpeed={0.8}
        zoomSpeed={1.0}
      />

      <gridHelper args={[256, 32, '#2a2a3a', '#1a1a2a']} position={[64, -10, 64]} />
    </>
  );
}

interface Scene3DProps {
  layerOpacities: Record<string, number>;
  globalLayerOpacity: number;
  terrainOpacity: number;
}

export function Scene3D({
  layerOpacities,
  globalLayerOpacity,
  terrainOpacity,
}: Scene3DProps) {
  const { toolMode, setSelectedPoint, setToolMode, clearMeasurements } = useAppStore();
  const [selectedPlaneId, setSelectedPlaneId] = useState<string | null>(null);

  return (
    <div className="flex-1 relative">
      <Canvas
        camera={{ position: [180, 120, 180], fov: 60, near: 0.1, far: 2000 }}
        onPointerMissed={() => {
          setSelectedPoint(null);
          setSelectedPlaneId(null);
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
        }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0a0a1a']} />
        <SceneContent
          selectedPlaneId={selectedPlaneId}
          onSelectPlane={setSelectedPlaneId}
          layerOpacities={layerOpacities}
          globalLayerOpacity={globalLayerOpacity}
          terrainOpacity={terrainOpacity}
        />
      </Canvas>

      {toolMode !== 'navigate' && (
        <div className="absolute top-4 left-4 bg-gray-900/90 backdrop-blur-sm px-4 py-3 rounded-lg text-sm border border-gray-700 max-w-md">
          <span className="text-gray-400">当前模式: </span>
          <span className="text-cyan-400 font-medium">
            {toolMode === 'section' && '剖切分析 - 点击三个点创建剖切平面'}
            {toolMode === 'measure-distance' && '距离测量 - 点击两点测量距离'}
            {toolMode === 'measure-angle' && '角度测量 - 依次点击三个点测量角度'}
            {toolMode === 'measure-height' && '高差测量 - 点击两点测量高度差'}
            {toolMode === 'query' && '信息查询 - 点击地形查询岩层信息'}
          </span>
        </div>
      )}

      {selectedPlaneId && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-cyan-900/80 backdrop-blur-sm px-4 py-2 rounded-lg text-sm border border-cyan-500">
          <span className="text-cyan-300">
            已选中剖切平面 - 点击环控旋转平面，点击中心移动平面
          </span>
        </div>
      )}

      {toolMode !== 'navigate' && (
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => {
              if (toolMode.startsWith('measure-')) {
                clearMeasurements();
              }
              setToolMode('navigate');
            }}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            退出工具
          </button>
        </div>
      )}

      <div className="absolute bottom-4 left-4 bg-gray-900/80 backdrop-blur-sm px-3 py-2 rounded-lg text-xs text-gray-400 border border-gray-700">
        <p>🖱️ 左键旋转 | 右键平移 | 滚轮缩放</p>
      </div>
    </div>
  );
}
