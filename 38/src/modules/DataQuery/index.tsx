import { useAppStore } from '../../store';

export function DataQuery() {
  const { queryResult, toolMode, setToolMode } = useAppStore();

  return (
    <div className="bg-gray-700/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">信息查询</h3>
        <button
          onClick={() => setToolMode('query')}
          className={`text-xs px-2 py-1 rounded ${
            toolMode === 'query' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-500'
          }`}
        >
          查询
        </button>
      </div>
      
      {queryResult ? (
        <div className="space-y-2 text-xs">
          <div className="bg-gray-600/50 rounded p-2">
            <p className="text-gray-400">位置:</p>
            <p className="text-gray-200 font-mono">
              X: {queryResult.position[0].toFixed(2)}<br />
              Y: {queryResult.position[1].toFixed(2)}<br />
              Z: {queryResult.position[2].toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-600/50 rounded p-2">
            <p className="text-gray-400">岩层名称:</p>
            <p className="text-cyan-400 font-medium">{queryResult.layerName}</p>
          </div>
          <div className="bg-gray-600/50 rounded p-2">
            <p className="text-gray-400">岩石类型:</p>
            <p className="text-gray-200">{queryResult.rockType}</p>
          </div>
          <div className="bg-gray-600/50 rounded p-2">
            <p className="text-gray-400">深度:</p>
            <p className="text-gray-200 font-mono">{queryResult.depth.toFixed(2)} m</p>
          </div>
          {queryResult.properties && (
            <div className="bg-gray-600/50 rounded p-2">
              <p className="text-gray-400">属性:</p>
              <div className="text-gray-200 space-y-0.5">
                {Object.entries(queryResult.properties).map(([key, value]) => (
                  <p key={key} className="font-mono">
                    {key}: {typeof value === 'number' ? value.toFixed(2) : String(value)}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">点击地形查询岩层信息</p>
      )}
    </div>
  );
}
