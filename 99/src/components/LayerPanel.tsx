import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Mountain,
  CircleDot,
  Layers,
  Pin,
  Ruler,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useGeoStore } from '@/store';
import type { LayerVisibility, LayerOpacity } from '@/types';

type LayerKey = keyof LayerVisibility;

interface LayerConfig {
  key: LayerKey;
  label: string;
  icon: typeof Mountain;
  color: string;
}

const layerConfigs: LayerConfig[] = [
  { key: 'terrain', label: '地形', icon: Mountain, color: 'text-geo-green' },
  { key: 'boreholes', label: '钻孔', icon: CircleDot, color: 'text-geo-orange' },
  { key: 'geoLayers', label: '地层', icon: Layers, color: 'text-geo-blue' },
  { key: 'annotations', label: '标注', icon: Pin, color: 'text-geo-green' },
  { key: 'measurements', label: '量测', icon: Ruler, color: 'text-purple-400' },
];

export default function LayerPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [boreholeLayersExpanded, setBoreholeLayersExpanded] = useState(false);
  const {
    layerVisibility,
    layerOpacity,
    boreholeLayerVisibility,
    setLayerVisibility,
    setLayerOpacity,
    setBoreholeLayerVisibility,
    toggleAllBoreholeLayers,
    boreholes,
  } = useGeoStore();

  const allLayerNames = [...new Set(boreholes.flatMap((b) => b.layers.map((l) => l.layerName)))];

  return (
    <div
      className={`flex flex-col bg-geo-dark border-r border-geo-border transition-all duration-300 ${
        isCollapsed ? 'w-12' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-between h-12 px-3 border-b border-geo-border">
        {!isCollapsed && (
          <span className="font-display font-semibold text-geo-text">图层管理</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded hover:bg-geo-dark-light text-geo-text-muted hover:text-geo-text transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {layerConfigs.map(({ key, label, icon: Icon, color }) => (
            <div
              key={key}
              className="bg-geo-dark-light rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-sm font-medium text-geo-text">{label}</span>
                </div>
                <button
                  onClick={() => setLayerVisibility(key, !layerVisibility[key])}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    layerVisibility[key]
                      ? 'bg-geo-orange border-geo-orange'
                      : 'border-geo-gray hover:border-geo-orange'
                  }`}
                >
                  {layerVisibility[key] && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-geo-text-muted w-8">
                  {Math.round(layerOpacity[key as keyof LayerOpacity] * 100)}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={layerOpacity[key as keyof LayerOpacity]}
                  onChange={(e) =>
                    setLayerOpacity(key, parseFloat(e.target.value))
                  }
                  className="flex-1 h-1"
                />
              </div>

              {key === 'boreholes' && allLayerNames.length > 0 && (
                <div className="mt-2 pt-2 border-t border-geo-border">
                  <button
                    onClick={() => setBoreholeLayersExpanded(!boreholeLayersExpanded)}
                    className="w-full flex items-center justify-between text-xs text-geo-text-muted hover:text-geo-text transition-colors"
                  >
                    <span>地层图层</span>
                    {boreholeLayersExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>

                  {boreholeLayersExpanded && (
                    <div className="mt-2 space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleAllBoreholeLayers(true)}
                          className="flex-1 px-2 py-1 text-xs bg-geo-dark rounded hover:bg-geo-orange/20 text-geo-text-muted hover:text-geo-text transition-colors"
                        >
                          全选
                        </button>
                        <button
                          onClick={() => toggleAllBoreholeLayers(false)}
                          className="flex-1 px-2 py-1 text-xs bg-geo-dark rounded hover:bg-geo-orange/20 text-geo-text-muted hover:text-geo-text transition-colors"
                        >
                          取消全选
                        </button>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {allLayerNames.map((layerName) => (
                          <div
                            key={layerName}
                            className="flex items-center justify-between py-1"
                          >
                            <span className="text-xs text-geo-text truncate flex-1">
                              {layerName}
                            </span>
                            <button
                              onClick={() =>
                                setBoreholeLayerVisibility(
                                  layerName,
                                  !boreholeLayerVisibility[layerName]
                                )
                              }
                              className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                boreholeLayerVisibility[layerName]
                                  ? 'bg-geo-orange border-geo-orange'
                                  : 'border-geo-gray hover:border-geo-orange'
                              }`}
                            >
                              {boreholeLayerVisibility[layerName] && (
                                <Check className="w-2 h-2 text-white" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center py-3 gap-3">
          {layerConfigs.map(({ key, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => setLayerVisibility(key, !layerVisibility[key])}
              className={`p-2 rounded-lg transition-colors ${
                layerVisibility[key]
                  ? 'bg-geo-dark-light'
                  : 'opacity-40 hover:opacity-100'
              }`}
              title={layerConfigs.find((l) => l.key === key)?.label}
            >
              <Icon className={`w-5 h-5 ${color}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
