import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Scissors,
  Plus,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { useGeoStore } from '@/store';
import type { SectionPlane } from '@/types';

type PlaneDirection = 'x' | 'y' | 'z';

interface DirectionConfig {
  key: PlaneDirection;
  label: string;
  normal: [number, number, number];
  color: string;
}

const directionConfigs: DirectionConfig[] = [
  { key: 'x', label: 'X轴', normal: [1, 0, 0], color: '#ef4444' },
  { key: 'y', label: 'Y轴', normal: [0, 1, 0], color: '#22c55e' },
  { key: 'z', label: 'Z轴', normal: [0, 0, 1], color: '#3b82f6' },
];

export default function SectionPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const {
    sectionPlanes,
    addSectionPlane,
    removeSectionPlane,
    updateSectionPlane,
    toggleSectionPlane,
  } = useGeoStore();

  const handleAddPlane = (direction: DirectionConfig) => {
    const plane: Omit<SectionPlane, 'id'> = {
      normal: direction.normal,
      position: [0, 0, 0],
      visible: true,
      color: direction.color,
    };
    addSectionPlane(plane);
  };

  const handlePositionChange = (id: string, axis: number, value: number) => {
    const plane = sectionPlanes.find((p) => p.id === id);
    if (!plane) return;

    const newPosition: [number, number, number] = [...plane.position];
    newPosition[axis] = value;
    updateSectionPlane(id, { position: newPosition });
  };

  const getPositionSliderLabel = (plane: SectionPlane): string => {
    const normal = plane.normal;
    if (Math.abs(normal[0]) > 0.9) return 'X 位置';
    if (Math.abs(normal[1]) > 0.9) return 'Y 位置';
    return 'Z 位置';
  };

  const getPositionSliderAxis = (plane: SectionPlane): number => {
    const normal = plane.normal;
    if (Math.abs(normal[0]) > 0.9) return 0;
    if (Math.abs(normal[1]) > 0.9) return 1;
    return 2;
  };

  const getDirectionLabel = (plane: SectionPlane): string => {
    const normal = plane.normal;
    if (Math.abs(normal[0]) > 0.9) return 'X轴';
    if (Math.abs(normal[1]) > 0.9) return 'Y轴';
    return 'Z轴';
  };

  return (
    <div
      className={`flex flex-col bg-geo-dark border-l border-geo-border transition-all duration-300 ${
        isCollapsed ? 'w-12' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-between h-12 px-3 border-b border-geo-border">
        {!isCollapsed && (
          <span className="font-display font-semibold text-geo-text">剖面管理</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded hover:bg-geo-dark-light text-geo-text-muted hover:text-geo-text transition-colors"
        >
          {isCollapsed ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="bg-geo-dark-light rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <Scissors className="w-4 h-4 text-geo-orange" />
              <span className="text-sm font-medium text-geo-text">添加剖切平面</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {directionConfigs.map((config) => (
                <button
                  key={config.key}
                  onClick={() => handleAddPlane(config)}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg bg-geo-dark hover:bg-geo-orange/20 transition-colors"
                  title={`添加${config.label}剖切平面`}
                >
                  <Plus className="w-4 h-4" style={{ color: config.color }} />
                  <span className="text-xs text-geo-text-muted">{config.label}</span>
                </button>
              ))}
            </div>
          </div>

          {sectionPlanes.length > 0 ? (
            <div className="space-y-2">
              {sectionPlanes.map((plane, index) => (
                <div
                  key={plane.id}
                  className="bg-geo-dark-light rounded-lg p-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: plane.color }}
                      />
                      <span className="text-sm font-medium text-geo-text">
                        {getDirectionLabel(plane)} #{index + 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleSectionPlane(plane.id)}
                        className={`p-1.5 rounded transition-colors ${
                          plane.visible
                            ? 'bg-geo-orange text-white'
                            : 'bg-geo-dark text-geo-text-muted hover:text-geo-text'
                        }`}
                        title={plane.visible ? '隐藏' : '显示'}
                      >
                        {plane.visible ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => removeSectionPlane(plane.id)}
                        className="p-1.5 rounded bg-geo-dark text-geo-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-geo-text-muted w-14">
                        {getPositionSliderLabel(plane)}
                      </span>
                      <span className="text-xs text-geo-text w-10 text-right">
                        {plane.position[getPositionSliderAxis(plane)].toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-30"
                      max="30"
                      step="0.5"
                      value={plane.position[getPositionSliderAxis(plane)]}
                      onChange={(e) =>
                        handlePositionChange(
                          plane.id,
                          getPositionSliderAxis(plane),
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full h-1"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-geo-text-muted text-sm">
              暂无剖切平面
              <div className="text-xs mt-1">点击上方按钮添加</div>
            </div>
          )}
        </div>
      )}

      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center py-3">
          <div className="p-2 rounded-lg bg-geo-dark-light">
            <Scissors className="w-5 h-5 text-geo-orange" />
          </div>
          {sectionPlanes.length > 0 && (
            <div className="mt-2 text-xs text-geo-text-muted">
              {sectionPlanes.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
