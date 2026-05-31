import { useState, useEffect } from 'react';
import { X, Save, Trash2, MapPin, AlertTriangle, Calendar, Tag } from 'lucide-react';
import { useBridgeStore } from '../../store/useBridgeStore';
import { defectTypeLabels, severityLabels, severityColors } from '../../utils/stressColors';
import type { DefectType, SeverityLevel } from '../../../shared';

export function PropertyPanel() {
  const { selectedDefect, updateDefect, removeDefect, selectDefect, layers, currentBridge } = useBridgeStore();
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    type: 'crack' as DefectType,
    severity: 'medium' as SeverityLevel,
    description: '',
    layerId: '',
  });

  useEffect(() => {
    if (selectedDefect) {
      setFormData({
        type: selectedDefect.type as DefectType,
        severity: selectedDefect.severity as SeverityLevel,
        description: selectedDefect.description,
        layerId: selectedDefect.layerId,
      });
      setEditMode(false);
    }
  }, [selectedDefect]);

  const handleSave = async () => {
    if (!selectedDefect) return;
    await updateDefect(selectedDefect.id, formData);
    setEditMode(false);
  };

  const handleDelete = async () => {
    if (!selectedDefect || !confirm('确定要删除此病害标注吗？')) return;
    await removeDefect(selectedDefect.id);
  };

  if (!selectedDefect) {
    return (
      <div className="bg-slate-900/90 backdrop-blur-sm border-l border-slate-700 h-full flex items-center justify-center">
        <div className="text-center text-slate-500">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">点击模型上的病害标记</p>
          <p className="text-sm">查看详细信息</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-sm border-l border-slate-700 h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">病害详情</h3>
        <button
          onClick={() => selectDefect(null)}
          className="p-1 rounded hover:bg-slate-700 transition-colors"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: severityColors[selectedDefect.severity] }}
          >
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-100">
              {defectTypeLabels[selectedDefect.type]}
            </p>
            <p className="text-xs" style={{ color: severityColors[selectedDefect.severity] }}>
              {severityLabels[selectedDefect.severity]}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">位置坐标</label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 bg-slate-800 rounded text-sm text-slate-300 font-mono">
                X: {selectedDefect.position.x.toFixed(2)}
              </div>
              <div className="flex-1 px-3 py-2 bg-slate-800 rounded text-sm text-slate-300 font-mono">
                Y: {selectedDefect.position.y.toFixed(2)}
              </div>
              <div className="flex-1 px-3 py-2 bg-slate-800 rounded text-sm text-slate-300 font-mono">
                Z: {selectedDefect.position.z.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar className="w-3 h-3" />
            <span>检测时间: {formatDate(selectedDefect.detectedAt)}</span>
          </div>

          {editMode ? (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">病害类型</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as DefectType })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  {Object.entries(defectTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">严重程度</label>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value as SeverityLevel })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  {Object.entries(severityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">所属图层</label>
                <select
                  value={formData.layerId}
                  onChange={(e) => setFormData({ ...formData, layerId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  {layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>{layer.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">描述信息</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:border-sky-500 resize-none"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">所属图层:</span>
                <span className="text-sm text-slate-200">
                  {layers.find((l) => l.id === selectedDefect.layerId)?.name || '未分类'}
                </span>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">描述信息</label>
                <p className="text-sm text-slate-200 bg-slate-800/50 p-3 rounded">
                  {selectedDefect.description || '暂无描述'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-slate-700 space-y-2">
        {editMode ? (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded transition-colors"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded transition-colors"
            >
              取消
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditMode(true)}
              className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded transition-colors"
            >
              编辑
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
