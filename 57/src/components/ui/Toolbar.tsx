import { MousePointer, PenTool, Ruler, Box, Thermometer, Eye, Grid3X3, Home, RotateCcw, Download } from 'lucide-react';
import { useBridgeStore } from '../../store/useBridgeStore';
import type { ViewMode, ToolMode } from '../../../shared';

export function Toolbar() {
  const { viewMode, setViewMode, toolMode, setToolMode, currentBridge } = useBridgeStore();

  const viewModes: { id: ViewMode; label: string; icon: any }[] = [
    { id: 'default', label: '默认视图', icon: Box },
    { id: 'stress', label: '应力视图', icon: Thermometer },
    { id: 'defect', label: '病害视图', icon: Eye },
    { id: 'wireframe', label: '线框模式', icon: Grid3X3 },
  ];

  const toolModes: { id: ToolMode; label: string; icon: any }[] = [
    { id: 'select', label: '选择', icon: MousePointer },
    { id: 'annotate', label: '标注', icon: PenTool },
    { id: 'measure', label: '测量', icon: Ruler },
  ];

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
      <div className="bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-xl shadow-2xl px-4 py-2 flex items-center gap-2">
        <div className="flex items-center gap-1 pr-3 border-r border-slate-700">
          <button
            className="p-2 rounded-lg bg-slate-700/50 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            title="重置视角"
          >
            <Home className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded-lg bg-slate-700/50 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            title="重置场景"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-3 border-r border-slate-700">
          <span className="text-xs text-slate-500 mr-2">工具</span>
          {toolModes.map((tool) => {
            const Icon = tool.icon;
            const isActive = toolMode === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => setToolMode(tool.id)}
                className={`p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700'
                }`}
                title={tool.label}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 px-3 border-r border-slate-700">
          <span className="text-xs text-slate-500 mr-2">视图</span>
          {viewModes.map((mode) => {
            const Icon = mode.icon;
            const isActive = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setViewMode(mode.id)}
                className={`p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700'
                }`}
                title={mode.label}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        <button
          className="p-2 rounded-lg bg-slate-700/50 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          title="导出截图"
        >
          <Download className="w-4 h-4" />
        </button>

        {currentBridge && (
          <div className="pl-3 border-l border-slate-700">
            <span className="text-xs text-slate-400">当前项目:</span>
            <span className="text-xs text-slate-200 ml-2">{currentBridge.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
