import { useState } from 'react';
import { Layers, Plus, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import { useBridgeStore } from '../../store/useBridgeStore';

export function LayerPanel() {
  const { layers, defects, toggleLayer, addLayer, currentBridge } = useBridgeStore();
  const [expanded, setExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerColor, setNewLayerColor] = useState('#0EA5E9');

  const handleAddLayer = () => {
    if (!newLayerName.trim() || !currentBridge) return;
    addLayer({
      name: newLayerName.trim(),
      color: newLayerColor,
      visible: true,
      bridgeId: currentBridge.id,
    });
    setNewLayerName('');
    setShowAddForm(false);
  };

  const getDefectCount = (layerId: string) => {
    return defects.filter((d) => d.layerId === layerId).length;
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-sm border-r border-slate-700 h-full flex flex-col">
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-slate-700 cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-sky-400" />
          <span className="font-semibold text-slate-100">图层管理</span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </div>

      {expanded && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors group"
            >
              <button
                onClick={() => toggleLayer(layer.id)}
                className="p-1 rounded hover:bg-slate-700 transition-colors"
              >
                {layer.visible ? (
                  <Eye className="w-4 h-4 text-slate-300" />
                ) : (
                  <EyeOff className="w-4 h-4 text-slate-500" />
                )}
              </button>
              
              <div
                className="w-4 h-4 rounded-full border-2 border-slate-600 flex-shrink-0"
                style={{ backgroundColor: layer.color }}
              />
              
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${layer.visible ? 'text-slate-200' : 'text-slate-500'}`}>
                  {layer.name}
                </p>
                <p className="text-xs text-slate-500">
                  {getDefectCount(layer.id)} 个标注
                </p>
              </div>
            </div>
          ))}

          {showAddForm ? (
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-600 space-y-2">
              <input
                type="text"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                placeholder="图层名称"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                autoFocus
              />
              <div className="flex gap-2">
                <input
                  type="color"
                  value={newLayerColor}
                  onChange={(e) => setNewLayerColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <button
                  onClick={handleAddLayer}
                  className="flex-1 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded transition-colors"
                >
                  创建
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 p-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">添加图层</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
