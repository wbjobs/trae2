import { useState } from 'react';
import { X, MapPin } from 'lucide-react';
import { useBridgeStore } from '../../store/useBridgeStore';
import { defectTypeLabels, severityLabels } from '../../utils/stressColors';
import type { DefectType, SeverityLevel } from '../../../shared';

interface AddDefectModalProps {
  position: { x: number; y: number; z: number };
  onClose: () => void;
}

export function AddDefectModal({ position, onClose }: AddDefectModalProps) {
  const { layers, currentBridge, addDefect } = useBridgeStore();
  const [formData, setFormData] = useState({
    type: 'crack' as DefectType,
    severity: 'medium' as SeverityLevel,
    description: '',
    layerId: layers[0]?.id || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBridge) return;

    await addDefect({
      ...formData,
      position,
      bridgeId: currentBridge.id,
      creatorId: 'user-002',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-slate-100">添加病害标注</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <p className="text-xs text-slate-400 mb-1">标注位置</p>
            <div className="flex gap-4 text-sm font-mono text-slate-300">
              <span>X: {position.x.toFixed(2)}</span>
              <span>Y: {position.y.toFixed(2)}</span>
              <span>Z: {position.z.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-2">病害类型</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as DefectType })}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500 transition-colors"
            >
              {Object.entries(defectTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-2">严重程度</label>
            <select
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value as SeverityLevel })}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500 transition-colors"
            >
              {Object.entries(severityLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-2">所属图层</label>
            <select
              value={formData.layerId}
              onChange={(e) => setFormData({ ...formData, layerId: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500 transition-colors"
            >
              {layers.map((layer) => (
                <option key={layer.id} value={layer.id}>{layer.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-2">描述信息</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="请输入病害描述..."
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors"
            >
              确认添加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
