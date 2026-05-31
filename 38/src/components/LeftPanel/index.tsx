import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Layers, Mountain, Box, Sliders, Download } from 'lucide-react';
import { useAppStore } from '../../store';

interface LayerItemProps {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  opacity: number;
  onToggleVisibility: () => void;
  onOpacityChange: (opacity: number) => void;
}

function LayerItem({
  id,
  name,
  color,
  visible,
  opacity,
  onToggleVisibility,
  onOpacityChange,
}: LayerItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg transition-colors"
      style={{ backgroundColor: isHovered ? 'rgba(55, 65, 81, 0.5)' : 'transparent' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="w-4 h-4 rounded-sm border border-gray-600 flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 text-sm text-gray-200 truncate">{name}</span>
      <button
        onClick={onToggleVisibility}
        className="p-1 text-gray-400 hover:text-white transition-colors flex-shrink-0"
      >
        {visible ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
          className="w-16 h-2 accent-cyan-500 cursor-pointer"
        />
        <span className="text-xs text-gray-400 w-10 text-right">
          {Math.round(opacity * 100)}%
        </span>
      </div>
    </div>
  );
}

interface SectionItemProps {
  id: string;
  name: string;
  visible: boolean;
  onToggleVisibility: () => void;
  onRemove: () => void;
}

function SectionItem({ id, name, visible, onToggleVisibility, onRemove }: SectionItemProps) {
  return (
    <div className="flex items-center gap-2 p-2 hover:bg-gray-700/50 rounded-lg transition-colors">
      <div className="w-4 h-4 rounded-sm bg-cyan-500/50 border border-cyan-500 flex-shrink-0" />
      <span className="flex-1 text-sm text-gray-200 truncate">{name}</span>
      <button
        onClick={onToggleVisibility}
        className="p-1 text-gray-400 hover:text-white transition-colors flex-shrink-0"
      >
        {visible ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
      <button
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, icon, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-700/30 transition-colors"
      >
        {icon}
        <span className="flex-1 text-sm font-medium text-gray-200">{title}</span>
        {isOpen ? (
          <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && <div className="px-3 pb-3 space-y-1">{children}</div>}
    </div>
  );
}

interface GlobalOpacityControlProps {
  title: string;
  opacity: number;
  onChange: (opacity: number) => void;
}

function GlobalOpacityControl({ title, opacity, onChange }: GlobalOpacityControlProps) {
  return (
    <div className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg">
      <span className="text-xs text-gray-400 flex-1">{title}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={opacity}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-20 h-2 accent-cyan-500 cursor-pointer"
      />
      <span className="text-xs text-cyan-400 w-10 text-right">
        {Math.round(opacity * 100)}%
      </span>
    </div>
  );
}

export function LeftPanel() {
  const {
    terrainData,
    geologyLayers,
    sectionPlanes,
    setLayerVisibility,
    setLayerOpacity,
    removeSectionPlane,
    updateSectionPlane,
  } = useAppStore();

  const [terrainOpacity, setTerrainOpacity] = useState(1);
  const [globalLayerOpacity, setGlobalLayerOpacity] = useState(0.65);
  const [layerOpacities, setLayerOpacities] = useState<Record<string, number>>({});

  const handleLayerOpacityChange = (layerId: string, opacity: number) => {
    setLayerOpacities(prev => ({ ...prev, [layerId]: opacity }));
  };

  const getLayerOpacity = (layerId: string) => {
    return layerOpacities[layerId] ?? globalLayerOpacity;
  };

  const handleExportSection = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `geology-section-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  return (
    <div className="w-64 bg-gray-900/95 border-r border-gray-700 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Layers size={20} className="text-cyan-400" />
          图层管理
        </h2>
        <button
          onClick={handleExportSection}
          className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
          title="导出当前视图"
        >
          <Download size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <CollapsibleSection title="地形模型" icon={<Mountain size={16} className="text-cyan-400" />}>
          {terrainData ? (
            <div className="space-y-2">
              <LayerItem
                id="terrain"
                name="数字高程模型"
                color="#4a7c59"
                visible={true}
                opacity={terrainOpacity}
                onToggleVisibility={() => {}}
                onOpacityChange={setTerrainOpacity}
              />
              <div className="text-xs text-gray-500 px-2">
                {terrainData.resolution} x {terrainData.resolution} 分辨率
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 px-2">暂无地形数据</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="地质岩层" icon={<Box size={16} className="text-amber-400" />}>
          {geologyLayers.length > 0 ? (
            <div className="space-y-2">
              <GlobalOpacityControl
                title="整体透明度"
                opacity={globalLayerOpacity}
                onChange={setGlobalLayerOpacity}
              />
              <div className="h-px bg-gray-700 my-2" />
              {geologyLayers.map((layer) => (
                <LayerItem
                  key={layer.id}
                  id={layer.id}
                  name={layer.name}
                  color={layer.color}
                  visible={true}
                  opacity={getLayerOpacity(layer.id)}
                  onToggleVisibility={() => {}}
                  onOpacityChange={(op) => handleLayerOpacityChange(layer.id, op)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 px-2">暂无岩层数据</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="剖切平面" icon={<Sliders size={16} className="text-rose-400" />}>
          {sectionPlanes.length > 0 ? (
            <div className="space-y-1">
              {sectionPlanes.map((plane) => (
                <SectionItem
                  key={plane.id}
                  id={plane.id}
                  name={plane.name}
                  visible={plane.visible}
                  onToggleVisibility={() =>
                    updateSectionPlane(plane.id, { visible: !plane.visible })
                  }
                  onRemove={() => removeSectionPlane(plane.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 px-2">
              暂无剖切平面
              <br />
              <span className="text-xs">切换到"剖切"模式，点击三个点创建</span>
            </p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="显示设置" icon={<Eye size={16} className="text-gray-400" />} defaultOpen={false}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">网格显示</span>
              <span className="text-gray-300">开启</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">坐标轴</span>
              <span className="text-gray-300">关闭</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">光照阴影</span>
              <span className="text-gray-300">开启</span>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <div className="p-4 border-t border-gray-700 bg-gray-900/50">
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>地形分辨率</span>
            <span className="text-gray-300">{terrainData?.resolution || 0}²</span>
          </div>
          <div className="flex justify-between">
            <span>岩层数量</span>
            <span className="text-gray-300">{geologyLayers.length}</span>
          </div>
          <div className="flex justify-between">
            <span>剖切平面</span>
            <span className="text-gray-300">{sectionPlanes.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
