import { useState } from 'react';
import {
  Navigation2,
  Ruler,
  Layers,
  Pin,
  Eye,
  MonitorPlay,
  ArrowRight,
  Box,
  Database,
} from 'lucide-react';
import { useGeoStore } from '@/store';
import type { ToolMode, ViewPreset } from '@/types';

interface ToolbarProps {
  onViewChange?: (view: ViewPreset) => void;
}

const toolConfig: Record<ToolMode, { icon: typeof Navigation2; label: string }> = {
  navigate: { icon: Navigation2, label: '漫游' },
  distance: { icon: Ruler, label: '距离量测' },
  thickness: { icon: Layers, label: '厚度量测' },
  annotate: { icon: Pin, label: '标注' },
};

const viewConfig: Record<ViewPreset, { icon: typeof Eye; label: string }> = {
  top: { icon: Eye, label: '顶视' },
  front: { icon: MonitorPlay, label: '正视' },
  side: { icon: ArrowRight, label: '侧视' },
  perspective: { icon: Box, label: '透视' },
};

export default function Toolbar({ onViewChange }: ToolbarProps) {
  const { toolMode, setToolMode, currentCoordinates } = useGeoStore();
  const [activeView, setActiveView] = useState<ViewPreset>('perspective');

  const handleViewChange = (view: ViewPreset) => {
    setActiveView(view);
    onViewChange?.(view);
  };

  return (
    <div className="h-14 bg-geo-dark border-b border-geo-border flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 mr-4">
          <Database className="w-6 h-6 text-geo-orange" />
          <span className="font-display font-bold text-xl text-geo-orange">GeoExplorer 3D</span>
        </div>

        <div className="h-8 w-px bg-geo-border mx-2" />

        <div className="flex items-center gap-1 bg-geo-dark-light rounded-lg p-1">
          {(Object.keys(toolConfig) as ToolMode[]).map((mode) => {
            const { icon: Icon, label } = toolConfig[mode];
            const isActive = toolMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setToolMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-geo-orange text-white shadow-lg'
                    : 'text-geo-text-muted hover:text-geo-text hover:bg-geo-dark'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-geo-dark-light rounded-lg p-1 mr-4">
          {(Object.keys(viewConfig) as ViewPreset[]).map((view) => {
            const { icon: Icon, label } = viewConfig[view];
            const isActive = activeView === view;
            return (
              <button
                key={view}
                onClick={() => handleViewChange(view)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-geo-blue text-white'
                    : 'text-geo-text-muted hover:text-geo-text hover:bg-geo-dark'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="h-8 w-px bg-geo-border mx-2" />

        <div className="flex items-center gap-4 bg-geo-dark-light rounded-lg px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-geo-text-muted text-xs font-display uppercase">X</span>
            <span className="font-mono text-sm text-geo-orange min-w-[100px]">
              {currentCoordinates ? currentCoordinates[0].toFixed(5) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-geo-text-muted text-xs font-display uppercase">Y</span>
            <span className="font-mono text-sm text-geo-green min-w-[100px]">
              {currentCoordinates ? currentCoordinates[1].toFixed(5) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-geo-text-muted text-xs font-display uppercase">Z</span>
            <span className="font-mono text-sm text-geo-blue min-w-[80px]">
              {currentCoordinates ? currentCoordinates[2].toFixed(2) + 'm' : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
