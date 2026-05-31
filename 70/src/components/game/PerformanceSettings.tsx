import { useState } from 'react';
import { Settings, X, Zap, Monitor, Cpu } from 'lucide-react';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { PerformanceLevel } from '../../../shared/types';

const levelLabels: Record<PerformanceLevel, { name: string; desc: string }> = {
  low: { name: '性能优先', desc: '最低画质，适合低配设备' },
  medium: { name: '平衡模式', desc: '画质与性能的平衡' },
  high: { name: '画质优先', desc: '最佳视觉效果' },
};

export function PerformanceSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const { level, config, setLevel, togglePostProcessing, toggleShadows, setParticleMultiplier } = usePerformanceStore();

  return (
    <div className="fixed top-4 right-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-800/90 hover:bg-gray-700 text-white rounded-lg transition-colors"
      >
        <Settings size={18} />
        <span className="text-sm">性能设置</span>
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-80 bg-gray-900/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Monitor size={18} />
              性能设置
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-4 space-y-6">
            <div>
              <label className="text-gray-300 text-sm font-medium mb-3 block">
                <Cpu size={16} className="inline mr-2" />
                性能档位
              </label>
              <div className="space-y-2">
                {(['low', 'medium', 'high'] as PerformanceLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLevel(lvl)}
                    className={`w-full p-3 rounded-lg text-left transition-all ${
                      level === lvl
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium">{levelLabels[lvl].name}</div>
                    <div className="text-xs opacity-75">{levelLabels[lvl].desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-gray-300 text-sm font-medium block">
                <Zap size={16} className="inline mr-2" />
                自定义选项
              </label>

              <div className="flex items-center justify-between py-2">
                <span className="text-gray-400 text-sm">后处理效果</span>
                <button
                  onClick={togglePostProcessing}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    config.postProcessing ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                      config.postProcessing ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-gray-400 text-sm">阴影效果</span>
                <button
                  onClick={toggleShadows}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    config.shadows ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                      config.shadows ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">粒子数量</span>
                  <span className="text-blue-400 text-sm font-mono">
                    {Math.round(config.particleMultiplier * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={config.particleMultiplier}
                  onChange={(e) => setParticleMultiplier(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-800/50 border-t border-gray-700">
            <div className="text-xs text-gray-500 text-center">
              当前设置: {levelLabels[level].name} · 帧率优化中
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
