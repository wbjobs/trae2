import { useMemo } from 'react';
import * as THREE from 'three';
import { getStressColor } from '../../../utils/stressColors';

interface BridgeDeckProps {
  viewMode: string;
  stressData: any;
  minStress: number;
  maxStress: number;
  onClick?: (event: any) => void;
}

export function BridgeDeck({
  viewMode,
  stressData,
  minStress,
  maxStress,
  onClick,
}: BridgeDeckProps) {
  const mainDeckGeometry = useMemo(() => new THREE.BoxGeometry(40, 0.3, 3.5), []);
  const sideDeckGeometry = useMemo(() => new THREE.BoxGeometry(40, 0.15, 4.5), []);
  const girderGeometry = useMemo(() => new THREE.BoxGeometry(40, 1.2, 1.8), []);
  const railingGeometry = useMemo(() => new THREE.BoxGeometry(0.08, 0.6, 40), []);
  const railingPostGeometry = useMemo(() => new THREE.BoxGeometry(0.06, 0.6, 0.06), []);
  const expansionJointGeometry = useMemo(() => new THREE.BoxGeometry(0.1, 0.1, 3.5), []);

  const getMaterial = (stressValue: number, baseColor: string, metalness = 0.4, roughness = 0.6) => {
    if (viewMode === 'stress' && stressData) {
      return new THREE.MeshStandardMaterial({
        color: getStressColor(stressValue, minStress, maxStress),
        metalness,
        roughness,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness,
      roughness,
      wireframe: viewMode === 'wireframe',
    });
  };

  const mainDeckMaterial = getMaterial(35, '#374151', 0.1, 0.85);
  const girderMaterial = getMaterial(65, '#6B7280', 0.5, 0.5);
  const railingMaterial = getMaterial(25, '#475569', 0.4, 0.6);
  const bearingMaterial = getMaterial(70, '#6B7280', 0.6, 0.4);

  const railingPosts = useMemo(() => {
    const posts: JSX.Element[] = [];
    const postCount = 20;
    const spacing = 40 / (postCount - 1);
    
    for (let i = 0; i < postCount; i++) {
      const x = -20 + i * spacing;
      posts.push(
        <mesh
          key={`railing-post-l-${i}`}
          geometry={railingPostGeometry}
          material={railingMaterial}
          position={[x, 0.9, 1.75]}
          onClick={onClick}
          castShadow
        />
      );
      posts.push(
        <mesh
          key={`railing-post-r-${i}`}
          geometry={railingPostGeometry}
          material={railingMaterial}
          position={[x, 0.9, -1.75]}
          onClick={onClick}
          castShadow
        />
      );
    }
    return posts;
  }, [railingPostGeometry, railingMaterial, onClick]);

  const expansionJoints = useMemo(() => {
    const joints: JSX.Element[] = [];
    const jointPositions = [-15, -5, 5, 15];
    
    jointPositions.forEach((x, idx) => {
      joints.push(
        <mesh
          key={`joint-${idx}`}
          geometry={expansionJointGeometry}
          material={bearingMaterial}
          position={[x, 0.25, 0]}
          onClick={onClick}
          castShadow
        />
      );
    });
    return joints;
  }, [expansionJointGeometry, bearingMaterial, onClick]);

  return (
    <group>
      <mesh
        geometry={sideDeckGeometry}
        material={mainDeckMaterial}
        position={[0, 0.6, 0]}
        onClick={onClick}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={mainDeckGeometry}
        material={mainDeckMaterial}
        position={[0, 0.35, 0]}
        onClick={onClick}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={girderGeometry}
        material={girderMaterial}
        position={[0, -0.4, 0]}
        onClick={onClick}
        castShadow
        receiveShadow
      />
      
      <mesh
        geometry={railingGeometry}
        material={railingMaterial}
        position={[0, 0.9, 1.75]}
        onClick={onClick}
        castShadow
      />
      <mesh
        geometry={railingGeometry}
        material={railingMaterial}
        position={[0, 0.9, -1.75]}
        onClick={onClick}
        castShadow
      />
      
      {railingPosts}
      {expansionJoints}
    </group>
  );
}
