import {
  MousePointer2,
  Scissors,
  Ruler,
  Triangle,
  ArrowUpDown,
  Search,
  Layers,
  RefreshCw,
  Download,
  Upload,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { ToolMode } from '../../types';

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function ToolButton({ icon, label, active, onClick }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all duration-200 ${
        active
          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
          : 'text-gray-400 hover:text-white hover:bg-gray-700/50 border border-transparent'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

export function Toolbar() {
  const { toolMode, setToolMode } = useAppStore();

  const tools: { mode: ToolMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'navigate', icon: <MousePointer2 size={20} />, label: '浏览' },
    { mode: 'section', icon: <Scissors size={20} />, label: '剖切' },
    { mode: 'measure-distance', icon: <Ruler size={20} />, label: '测距' },
    { mode: 'measure-angle', icon: <Triangle size={20} />, label: '测角' },
    { mode: 'measure-height', icon: <ArrowUpDown size={20} />, label: '高差' },
    { mode: 'query', icon: <Search size={20} />, label: '查询' },
  ];

  return (
    <div className="h-16 bg-gray-900/95 border-b border-gray-700 flex items-center px-4 justify-between">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 mr-4">
          <Layers size={24} className="text-cyan-400" />
          <span className="text-lg font-bold text-white">Geo3D Platform</span>
        </div>

        <div className="h-8 w-px bg-gray-600 mx-2" />

        <div className="flex items-center gap-1">
          {tools.map((tool) => (
            <ToolButton
              key={tool.mode}
              icon={tool.icon}
              label={tool.label}
              active={toolMode === tool.mode}
              onClick={() => setToolMode(tool.mode)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors">
          <Upload size={18} />
          <span className="text-sm">导入数据</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors">
          <Download size={18} />
          <span className="text-sm">导出</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors">
          <RefreshCw size={18} />
          <span className="text-sm">重置</span>
        </button>
      </div>
    </div>
  );
}
