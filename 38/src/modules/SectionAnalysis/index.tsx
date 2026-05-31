import { useAppStore } from '../../store';

export function SectionAnalysis() {
  const { sectionPlanes, removeSectionPlane, toolMode, setToolMode } = useAppStore();

  return (
    <div className="bg-gray-700/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">剖切平面</h3>
        <button
          onClick={() => setToolMode('section')}
          className={`text-xs px-2 py-1 rounded ${
            toolMode === 'section' ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-500'
          }`}
        >
          + 添加
        </button>
      </div>
      
      {sectionPlanes.length === 0 ? (
        <p className="text-xs text-gray-500">暂无剖切平面</p>
      ) : (
        <div className="space-y-2">
          {sectionPlanes.map((plane) => (
            <div
              key={plane.id}
              className="flex items-center justify-between bg-gray-600/50 rounded px-2 py-1.5"
            >
              <span className="text-xs text-gray-300">{plane.name}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => removeSectionPlane(plane.id)}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
