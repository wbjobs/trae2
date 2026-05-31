import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Text, Html } from '@react-three/drei';
import type { Annotation } from '@/types';
import type { SceneParams } from '@/utils/geoUtils';
import { lonLatToSceneCoord } from '@/utils/geoUtils';

interface AnnotationMarkersProps {
  annotations: Annotation[];
  sceneParams: SceneParams;
  selectedId?: string | null;
  opacity?: number;
  onSelect?: (annotation: Annotation) => void;
}

export default function AnnotationMarkers({
  annotations,
  sceneParams,
  selectedId = null,
  opacity = 1,
  onSelect,
}: AnnotationMarkersProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const annotationData = useMemo(() => {
    return annotations.map((annotation) => {
      const [lon, lat, elev] = annotation.position;
      const [x, y, z] = lonLatToSceneCoord(lon, lat, elev, sceneParams);
      const isSelected = selectedId === annotation.id;
      const isHovered = hoveredId === annotation.id;
      const threeColor = new THREE.Color(annotation.color);

      return {
        original: annotation,
        scenePosition: [x, y, z] as [number, number, number],
        labelPosition: [x, y + 1.5, z] as [number, number, number],
        isSelected,
        isHovered,
        threeColor,
        color: annotation.color,
        id: annotation.id,
        name: annotation.name,
        description: annotation.description,
        type: annotation.type,
        position: annotation.position,
        createdAt: annotation.createdAt,
      };
    });
  }, [annotations, sceneParams, selectedId, hoveredId]);

  const handleClick = (e: { stopPropagation: () => void }, annotation: typeof annotationData[0]) => {
    e.stopPropagation();
    onSelect?.(annotation.original);
  };

  const handlePointerOver = (e: { stopPropagation: () => void }, id: string) => {
    e.stopPropagation();
    setHoveredId(id);
  };

  const handlePointerOut = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setHoveredId(null);
  };

  const renderPin = (annotation: typeof annotationData[0]) => {
    const scale = annotation.isSelected ? 1.3 : annotation.isHovered ? 1.15 : 1;

    return (
      <group key={annotation.id} position={annotation.scenePosition}>
        <group scale={[scale, scale, scale]}>
          <mesh
            onClick={(e) => handleClick(e, annotation)}
            onPointerOver={(e) => handlePointerOver(e, annotation.id)}
            onPointerOut={handlePointerOut}
            position={[0, 0.5, 0]}
          >
            <coneGeometry args={[0.3, 1, 8]} />
            <meshStandardMaterial
              color={annotation.threeColor}
              emissive={annotation.isSelected ? annotation.threeColor : new THREE.Color(0x000000)}
              emissiveIntensity={annotation.isSelected ? 0.4 : 0}
            />
          </mesh>
          <mesh position={[0, -0.1, 0]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color={annotation.threeColor} />
          </mesh>
        </group>

        {annotation.isHovered && (
          <Html
            position={[0, 2, 0]}
            center
            style={{
              background: 'rgba(0, 0, 0, 0.85)',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: `1px solid ${annotation.color}`,
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{annotation.name}</div>
            {annotation.description && <div style={{ opacity: 0.8 }}>{annotation.description}</div>}
          </Html>
        )}

        <Text
          position={annotation.labelPosition}
          fontSize={0.5}
          color="white"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.03}
          outlineColor="#000000"
        >
          {annotation.name}
        </Text>
      </group>
    );
  };

  const renderLabel = (annotation: typeof annotationData[0]) => {
    const scale = annotation.isSelected ? 1.3 : annotation.isHovered ? 1.15 : 1;

    return (
      <group key={annotation.id} position={annotation.scenePosition}>
        <mesh
          onClick={(e) => handleClick(e, annotation)}
          onPointerOver={(e) => handlePointerOver(e, annotation.id)}
          onPointerOut={handlePointerOut}
          scale={[scale, scale, scale]}
        >
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshStandardMaterial
            color={annotation.color}
            transparent
            opacity={opacity * 0.7}
            emissive={annotation.isSelected ? annotation.color : new THREE.Color(0x000000)}
            emissiveIntensity={annotation.isSelected ? 0.4 : 0}
          />
        </mesh>

        {annotation.isHovered && (
          <Html
            position={[0, 1.5, 0]}
            center
            style={{
              background: 'rgba(0, 0, 0, 0.85)',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: `1px solid ${annotation.color}`,
            }}
          >
            <div style={{ fontWeight: 'bold' }}>{annotation.name}</div>
          </Html>
        )}

        <Text
          position={annotation.labelPosition}
          fontSize={0.6}
          color={annotation.color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#000000"
        >
          {annotation.name}
        </Text>
      </group>
    );
  };

  const renderArea = (annotation: typeof annotationData[0]) => {
    const radius = 2;
    const segments = 32;

    const geometry = new THREE.RingGeometry(radius * 0.8, radius, segments);
    geometry.rotateX(-Math.PI / 2);

    return (
      <group key={annotation.id} position={annotation.scenePosition}>
        <mesh
          onClick={(e) => handleClick(e, annotation)}
          onPointerOver={(e) => handlePointerOver(e, annotation.id)}
          onPointerOut={handlePointerOut}
          geometry={geometry}
        >
          <meshBasicMaterial
            color={annotation.threeColor}
            transparent
            opacity={opacity * 0.6}
            side={THREE.DoubleSide}
          />
        </mesh>

        <mesh>
          <ringGeometry args={[radius * 0.95, radius, segments]} />
          <meshBasicMaterial color={annotation.threeColor} side={THREE.DoubleSide} />
        </mesh>

        {annotation.isHovered && (
          <Html
            position={[0, 1, 0]}
            center
            style={{
              background: 'rgba(0, 0, 0, 0.85)',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: `1px solid ${annotation.color}`,
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{annotation.name}</div>
            {annotation.description && <div style={{ opacity: 0.8 }}>{annotation.description}</div>}
          </Html>
        )}

        <Text
          position={annotation.labelPosition}
          fontSize={0.5}
          color="white"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.03}
          outlineColor="#000000"
        >
          {annotation.name}
        </Text>
      </group>
    );
  };

  return (
    <group>
      {annotationData.map((annotation) => {
        switch (annotation.type) {
          case 'pin':
            return renderPin(annotation);
          case 'label':
            return renderLabel(annotation);
          case 'area':
            return renderArea(annotation);
          default:
            return renderPin(annotation);
        }
      })}
    </group>
  );
}
