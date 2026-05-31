import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Terrain, MountainBackground, Rocks } from './Terrain';
import { WeatherEffects, FogController, DynamicLighting } from './WeatherEffects';
import { WeatherDevice } from './WeatherDevices';
import { useGameStore } from '../../store/gameStore';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { WeatherType, Device } from '../../../shared/types';

interface SceneProps {
  weather: WeatherType;
  weatherIntensity: number;
  devices: Device[];
  selectedDevice: Device | null;
  onSelectDevice: (device: Device | null) => void;
}

function SceneContent({ 
  weather, 
  weatherIntensity, 
  devices, 
  selectedDevice,
  onSelectDevice 
}: SceneProps) {
  const { config } = usePerformanceStore();

  return (
    <>
      <DynamicLighting weather={weather} intensity={weatherIntensity} />
      
      {weather === 'sunny' && (
        <Sky 
          distance={450000} 
          sunPosition={[100, 50, 100]} 
          inclination={0.5} 
          azimuth={0.25} 
        />
      )}
      
      <FogController weather={weather} intensity={weatherIntensity} />
      
      <Terrain />
      <MountainBackground />
      <Rocks />
      
      {devices.map((device) => (
        <WeatherDevice
          key={device.id}
          device={device}
          isSelected={selectedDevice?.id === device.id}
          onClick={() => onSelectDevice(selectedDevice?.id === device.id ? null : device)}
        />
      ))}
      
      <WeatherEffects weather={weather} intensity={weatherIntensity} />
      
      {config.postProcessing && (
        <EffectComposer>
          <Bloom 
            intensity={0.5} 
            luminanceThreshold={0.9} 
            luminanceSmoothing={0.9} 
            mipmapBlur 
          />
        </EffectComposer>
      )}
      
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.1}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

export function GameScene() {
  const { gameState, selectedDevice, selectDevice } = useGameStore();
  const { config } = usePerformanceStore();
  
  if (!gameState) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900">
        <div className="text-white text-xl">加载中...</div>
      </div>
    );
  }

  return (
    <Canvas
      shadows={config.shadows}
      camera={{ position: [0, 8, 15], fov: 50 }}
      className="w-full h-full"
      gl={{ 
        antialias: config.level !== 'low',
        powerPreference: config.level === 'low' ? 'low-power' : 'high-performance'
      }}
    >
      <SceneContent
        weather={gameState.weather}
        weatherIntensity={gameState.weatherIntensity}
        devices={gameState.devices}
        selectedDevice={selectedDevice}
        onSelectDevice={selectDevice}
      />
    </Canvas>
  );
}
