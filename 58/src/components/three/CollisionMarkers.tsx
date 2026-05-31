import { useScene } from '@/store/scene';

export default function CollisionMarkers() {
  const collisions = useScene((s) => s.collisions);
  const select = useScene((s) => s.select);

  return (
    <group>
      {collisions.map((c) => (
        <group
          key={c.id}
          position={c.point}
          onClick={(e) => {
            e.stopPropagation();
            select(c.a);
          }}
        >
          <mesh>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshBasicMaterial
              color={c.level === 'danger' ? '#ff3b3b' : '#ff8a00'}
              transparent
              opacity={0.55}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshBasicMaterial color={c.level === 'danger' ? '#ff3b3b' : '#ffd23b'} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
