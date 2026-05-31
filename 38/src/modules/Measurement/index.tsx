import { useAppStore } from '../../store';

export function Measurement() {
  const { measurements, clearMeasurements, toolMode, setToolMode } = useAppStore();

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'distance': return '距离';
      case 'angle': return '角度';
      case 'height': return '高差';
      default: return type;
    }
  };

  return (
    <div className="bg-gray-700/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">测量结果</h3>
        {measurements.length > 0 && (
          <button
            onClick={clearMeasurements}
            className="text-xs text-red-400 hover:text-red-300"
          >
            清除全部
          </button>
        )}
      </div>
      
      {measurements.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">暂无测量数据</p>
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => setToolMode('measure-distance')}
              className={`text-xs px-2 py-1 rounded ${
                toolMode === 'measure-distance' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-500'
              }`}
            >
              距离
            </button>
            <button
              onClick={() => setToolMode('measure-height')}
              className={`text-xs px-2 py-1 rounded ${
                toolMode === 'measure-height' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-500'
              }`}
            >
              高差
            </button>
            <button
              onClick={() => setToolMode('measure-angle')}
              className={`text-xs px-2 py-1 rounded ${
                toolMode === 'measure-angle' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-500'
              }`}
            >
              角度
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {measurements.map((m) => (
            <div
              key={m.id}
              className="bg-gray-600/50 rounded px-2 py-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{getTypeLabel(m.type)}</span>
                <span className="text-xs text-cyan-400 font-mono">
                  {m.value.toFixed(2)}{m.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
