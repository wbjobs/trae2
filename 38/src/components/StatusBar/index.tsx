import { Monitor, Activity, MapPin, Eye } from 'lucide-react';
import { useAppStore } from '../../store';

export function StatusBar() {
  const { selectedPoint, terrainData, toolMode } = useAppStore();

  return (
    <div className="h-8 bg-gray-900/95 border-t border-gray-700 flex items-center justify-between px-4 text-xs">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-gray-400">
          <MapPin size={12} />
          <span>坐标:</span>
          {selectedPoint ? (
            <span className="text-cyan-400 font-mono">
              X: {selectedPoint[0].toFixed(1)} Y: {selectedPoint[1].toFixed(1)} Z: {selectedPoint[2].toFixed(1)}
            </span>
          ) : (
            <span className="text-gray-600">--</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-gray-400">
          <Eye size={12} />
          <span>地形范围:</span>
          {terrainData ? (
            <span className="text-gray-300 font-mono">
              {terrainData.bounds.maxX.toFixed(0)} x {terrainData.bounds.maxY.toFixed(0)}
            </span>
          ) : (
            <span className="text-gray-600">--</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-gray-400">
          <Activity size={12} />
          <span>FPS:</span>
          <span className="text-green-400 font-mono">60</span>
        </div>

        <div className="flex items-center gap-2 text-gray-400">
          <Monitor size={12} />
          <span>渲染引擎:</span>
          <span className="text-gray-300">Three.js + WebGL</span>
        </div>

        <div className="h-4 w-px bg-gray-700" />

        <div className="text-gray-500">
          山地地形地质体三维建模与剖切分析平台 v1.0
        </div>
      </div>
    </div>
  );
}
