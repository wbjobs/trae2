import { useAppStore } from '../../store';
import { generateTerrainData } from '../../utils/mockData';

export function TerrainModeling() {
  const { terrainData, setTerrainData } = useAppStore();

  const handleGenerateTerrain = () => {
    const newData = generateTerrainData();
    setTerrainData(newData);
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleGenerateTerrain}
        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2 px-4 rounded-lg text-sm transition-colors"
      >
        重新生成地形
      </button>
      
      {terrainData && (
        <div className="text-xs text-gray-400 space-y-1">
          <p>分辨率: {terrainData.resolution}x{terrainData.resolution}</p>
          <p>范围: {terrainData.bounds.maxX - terrainData.bounds.minX}m</p>
          <p>高程范围: {terrainData.bounds.minZ.toFixed(0)} ~ {terrainData.bounds.maxZ.toFixed(0)}m</p>
        </div>
      )}
    </div>
  );
}
