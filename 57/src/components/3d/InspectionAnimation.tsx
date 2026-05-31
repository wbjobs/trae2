import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface InspectionPoint {
  position: THREE.Vector3;
  name: string;
  description: string;
}

interface InspectionAnimationProps {
  active: boolean;
  type: 'drone' | 'climber' | 'rope';
  speed?: number;
  onComplete?: () => void;
}

const inspectionPoints: InspectionPoint[] = [
  { position: new THREE.Vector3(-18, 8, 0), name: '左塔顶', description: '主塔顶部检查' },
  { position: new THREE.Vector3(-18, 2, 0), name: '左塔中', description: '塔柱中部检测' },
  { position: new THREE.Vector3(-10, 1, 0), name: '左跨', description: '左跨主梁检测' },
  { position: new THREE.Vector3(0, 1, 0), name: '跨中', description: '主跨中部检测' },
  { position: new THREE.Vector3(10, 1, 0), name: '右跨', description: '右跨主梁检测' },
  { position: new THREE.Vector3(18, 2, 0), name: '右塔中', description: '塔柱中部检测' },
  { position: new THREE.Vector3(18, 8, 0), name: '右塔顶', description: '主塔顶部检查' },
  { position: new THREE.Vector3(0, 6, 0), name: '主缆', description: '主缆系统检测' },
];

export function DroneInspection({ active, speed = 1, onComplete }: InspectionAnimationProps) {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useRef(0);
  const [currentPoint, setCurrentPoint] = useState(0);

  const pathPoints = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      inspectionPoints.map(p => p.position.clone()),
      false,
      'catmullrom',
      0.5
    );
    return curve.getPoints(200);
  }, []);

  const trailGeometry = useMemo(() => {
    const positions = new Float32Array(pathPoints.length * 3);
    pathPoints.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [pathPoints]);

  useFrame((state, delta) => {
    if (!active || !groupRef.current) return;

    progressRef.current += delta * 0.1 * speed;
    
    if (progressRef.current >= 1) {
      progressRef.current = 0;
      onComplete?.();
    }

    const pointIndex = Math.floor(progressRef.current * pathPoints.length);
    const clampedIndex = Math.min(pointIndex, pathPoints.length - 1);
    const position = pathPoints[clampedIndex];
    
    groupRef.current.position.copy(position);
    
    const lookIndex = Math.min(clampedIndex + 3, pathPoints.length - 1);
    groupRef.current.lookAt(pathPoints[lookIndex]);

    const newPoint = Math.floor(progressRef.current * inspectionPoints.length);
    if (newPoint !== currentPoint && newPoint < inspectionPoints.length) {
      setCurrentPoint(newPoint);
    }
  });

  if (!active) return null;

  return (
    <group>
      <line geometry={trailGeometry}>
        <lineBasicMaterial 
          color="#0EA5E9" 
          transparent 
          opacity={0.6}
          linewidth={2}
        />
      </line>
      
      <group ref={groupRef}>
        <mesh>
          <boxGeometry args={[0.6, 0.3, 0.6]} />
          <meshStandardMaterial 
            color="#0EA5E9" 
            emissive="#0EA5E9" 
            emissiveIntensity={0.5}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
        
        <mesh position={[0.35, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 8]} />
          <meshStandardMaterial color="#60A5FA" />
        </mesh>
        <mesh position={[-0.35, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 8]} />
          <meshStandardMaterial color="#60A5FA" />
        </mesh>
        <mesh position={[0, 0, 0.35]}>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 8]} />
          <meshStandardMaterial color="#60A5FA" />
        </mesh>
        <mesh position={[0, 0, -0.35]}>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 8]} />
          <meshStandardMaterial color="#60A5FA" />
        </mesh>

        <pointLight color="#0EA5E9" intensity={2} distance={5} />
        
        <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.5, 32]} />
          <meshBasicMaterial 
            color="#0EA5E9" 
            transparent 
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {inspectionPoints.map((point, idx) => (
        <group key={idx} position={[point.position.x, point.position.y, point.position.z]}>
          <mesh>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshBasicMaterial 
              color={idx <= currentPoint ? '#22C55E' : '#64748B'} 
              transparent
              opacity={0.8}
            />
          </mesh>
          {idx === currentPoint && (
            <mesh>
              <ringGeometry args={[0.2, 0.3, 32]} />
              <meshBasicMaterial 
                color="#F59E0B" 
                transparent
                opacity={0.6}
              />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

export function ClimberInspection({ active, speed = 1, onComplete }: InspectionAnimationProps) {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useRef(0);

  useFrame((state, delta) => {
    if (!active || !groupRef.current) return;

    progressRef.current += delta * 0.05 * speed;
    
    if (progressRef.current >= 1) {
      progressRef.current = 0;
      onComplete?.();
    }

    const t = progressRef.current;
    const x = -16 + t * 32;
    const y = 0.8 + Math.sin(t * Math.PI * 2) * 0.2;
    
    groupRef.current.position.set(x, y, 0);
  });

  if (!active) return null;

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.8, 0.3, 0.5]} />
        <meshStandardMaterial color="#F59E0B" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.3, 0.4, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.4, 8]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[-0.3, 0.4, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.4, 8]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[0, 0, 0.3]}>
        <boxGeometry args={[0.2, 0.15, 0.1]} />
        <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={0.3} />
      </mesh>
      <pointLight color="#F59E0B" intensity={1.5} distance={4} />
    </group>
  );
}

export function RopeAccessInspection({ active, speed = 1, onComplete }: InspectionAnimationProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ropeRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);

  useFrame((state, delta) => {
    if (!active || !groupRef.current) return;

    progressRef.current += delta * 0.08 * speed;
    
    if (progressRef.current >= 1) {
      progressRef.current = 0;
      onComplete?.();
    }

    const t = progressRef.current;
    const x = -16 + t * 32;
    const y = 5 - Math.sin(t * Math.PI) * 3;
    
    groupRef.current.position.set(x, y, 0.8);

    if (ropeRef.current) {
      const ropeLength = 8 - y;
      ropeRef.current.scale.y = ropeLength;
      ropeRef.current.position.y = ropeLength / 2;
    }
  });

  if (!active) return null;

  return (
    <group>
      <mesh ref={ropeRef} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
        <meshStandardMaterial color="#9CA3AF" />
      </mesh>
      
      <group ref={groupRef}>
        <mesh>
          <boxGeometry args={[0.5, 0.6, 0.4]} />
          <meshStandardMaterial color="#8B5CF6" />
        </mesh>
        <mesh position={[0, 0.2, 0.25]}>
          <boxGeometry args={[0.3, 0.25, 0.1]} />
          <meshStandardMaterial color="#FBBF24" />
        </mesh>
        <mesh position={[0, -0.4, 0]}>
          <torusGeometry args={[0.3, 0.05, 8, 16]} />
          <meshStandardMaterial color="#EF4444" />
        </mesh>
        <pointLight color="#8B5CF6" intensity={1} distance={3} />
      </group>
    </group>
  );
}
