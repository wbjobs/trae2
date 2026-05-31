import { useMemo } from 'react';
import * as THREE from 'three';
import type { SectionPlane } from '@/types';
import type { Borehole, DEMData } from '@/types';
import type { SceneParams } from '@/utils/geoUtils';
import { lonLatToSceneCoord } from '@/utils/geoUtils';

interface SectionViewProps {
  sectionPlanes: SectionPlane[];
  boreholes: Borehole[];
  demData: DEMData | null;
  sceneParams: SceneParams;
}

export default function SectionView({
  sectionPlanes,
  boreholes,
  demData,
  sceneParams,
}: SectionViewProps) {
  const visiblePlanes = useMemo(
    () => sectionPlanes.filter((p) => p.visible),
    [sectionPlanes]
  );

  const sectionGeometries = useMemo(() => {
    return visiblePlanes.map((plane) => {
      const normal = new THREE.Vector3(...plane.normal).normalize();
      const planePoint = new THREE.Vector3(...plane.position);

      const boreholeIntersections: { point: THREE.Vector3; borehole: Borehole }[] = [];

      boreholes.forEach((borehole) => {
        const [bx, by, bz] = lonLatToSceneCoord(
          borehole.longitude,
          borehole.latitude,
          borehole.elevation,
          sceneParams
        );

        const boreholeBase = new THREE.Vector3(bx, by - borehole.depth * sceneParams.verticalExaggeration, bz);
        const boreholeTop = new THREE.Vector3(bx, by + 5, bz);

        const line = new THREE.Line3(boreholeBase, boreholeTop);
        const intersection = new THREE.Vector3();
        
        const planeObj = new THREE.Plane();
        planeObj.setFromNormalAndCoplanarPoint(normal, planePoint);
        
        if (planeObj.intersectLine(line, intersection)) {
          boreholeIntersections.push({ point: intersection, borehole });
        }
      });

      const size = 60;
      const gridDivisions = 20;
      const gridGeometry = new THREE.BufferGeometry();
      const gridVertices: number[] = [];

      for (let i = 0; i <= gridDivisions; i++) {
        const t = i / gridDivisions;
        const offset = (t - 0.5) * size;
        
        gridVertices.push(-size / 2, 0, offset, size / 2, 0, offset);
        gridVertices.push(offset, 0, -size / 2, offset, 0, size / 2);
      }

      gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridVertices, 3));

      const quaternion = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      
      if (Math.abs(normal.dot(up)) > 0.99) {
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      } else {
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      }

      return {
        id: plane.id,
        position: planePoint,
        quaternion,
        gridGeometry,
        color: plane.color,
        boreholeIntersections,
      };
    });
  }, [visiblePlanes, boreholes, sceneParams]);

  return (
    <group>
      {sectionGeometries.map((section) => (
        <group
          key={section.id}
          position={section.position}
          quaternion={section.quaternion}
        >
          <lineSegments geometry={section.gridGeometry}>
            <lineBasicMaterial
              color={section.color}
              transparent
              opacity={0.3}
            />
          </lineSegments>
          
          {section.boreholeIntersections.map((intersection, idx) => (
            <group key={idx} position={intersection.point.clone().sub(section.position)}>
              <mesh>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshBasicMaterial color={section.color} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
