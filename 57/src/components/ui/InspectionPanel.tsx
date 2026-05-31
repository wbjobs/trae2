import { useState } from 'react';
import { Play, Pause, Square, Drone, PersonStanding, Navigation, ChevronDown, Settings } from 'lucide-react';

export type InspectionType = 'drone' | 'climber' | 'rope' | null;

interface InspectionPanelProps {
  activeInspection: InspectionType;
  onStart: (type: InspectionType) => void;
  onStop: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export function InspectionPanel({
  activeInspection,
  onStart,
  onStop,
  speed,
  onSpeedChange,
}: InspectionPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const inspectionModes = [
    {
      id: 'drone' as const,
      label: '无人机巡检',
      icon: Drone,
      color: 'text-sky-400',
      bgColor: 'bg-sky-500/20',
      description: '无人机自动巡检全桥',
    },
    {
      id: 'climber' as const,
      label: '爬行机器人',
      icon: Navigation,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/20',
      description: '桥面爬行检测机器人',
    },
    {
      id: 'rope' as const,
      label: '绳索作业',
      icon: PersonStanding,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/20',
      description: '人工绳索检修模拟',
    },
  ];

  const activeMode = inspectionModes.find((m) => m.id === activeInspection);

  return (
    <div className="bg-slate-800/95 backdrop-blur-sm rounded-lg border border-slate-700 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-medium text-slate-200">检修模拟</span>
          {activeMode && (
            <span className={`px-2 py-0.5 ${activeMode.bgColor} ${activeMode.color} text-xs rounded-full flex items-center gap-1`}>
              <Play className="w-3 h-3" />
              {activeMode.label}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {inspectionModes.map((mode) => {
              const Icon = mode.icon;
              const isActive = activeInspection === mode.id;
              
              return (
                <button
                  key={mode.id}
                  onClick={() => isActive ? onStop() : onStart(mode.id)}
                  className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
                    isActive
                      ? `${mode.bgColor} border-sky-500/50`
                      : 'bg-slate-900/30 border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? mode.color : 'text-slate-400'}`} />
                  <span className={`text-xs font-medium ${isActive ? mode.color : 'text-slate-300'}`}>
                    {mode.label}
                  </span>
                  {isActive && (
                    <div className="flex items-center gap-1">
                      <Pause className="w-3 h-3" />
                      <span className="text-xs text-slate-400">运行中</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {activeInspection && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">
                  动画速度: {speed.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={speed}
                  onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0.5x</span>
                  <span>3x</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onStop}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm transition-colors"
                >
                  <Square className="w-4 h-4" />
                  停止
                </button>
              </div>

              {activeMode && (
                <div className="p-3 bg-slate-900/50 rounded-lg">
                  <p className="text-xs text-slate-400">{activeMode.description}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
