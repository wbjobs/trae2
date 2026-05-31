import { useScene, type StyleConfig } from '@/store/scene';
import { useState } from 'react';
import { Download, Eye, Palette, Layers } from 'lucide-react';
import { downloadSectionImage, downloadSectionSVG } from '@/utils/sectionExport';

const presets: Record<string, Partial<StyleConfig>> = {
  写实: { opacity: 1, showWireframe: false, roughness: 0.55, metalness: 0.2 },
  半透明: { opacity: 0.6, showWireframe: false, roughness: 0.7, metalness: 0 },
  线框: { opacity: 1, showWireframe: true, roughness: 1, metalness: 0 },
  金属: { opacity: 1, showWireframe: false, roughness: 0.2, metalness: 0.8 },
};

export default function StylePanel() {
  const style = useScene((s) => s.style);
  const setStyle = useScene((s) => s.setStyle);
  const clip = useScene((s) => s.clip);
  const pipelines = useScene((s) => s.pipelines);
  const [presetKey, setPresetKey] = useState<string>('写实');

  const applyPreset = (key: string) => {
    setPresetKey(key);
    setStyle(presets[key]);
  };

  return (
    <div className="p-4 space-y-5 bg-base-800/50 border-b border-base-700">
      <div className="flex items-center gap-2 text-accent-cyan font-semibold">
        <Palette className="w-4 h-4" />
        <span>管线样式</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {Object.keys(presets).map((key) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            className={`px-2 py-1.5 text-xs rounded border transition-colors ${presetKey === key
              ? 'bg-accent-cyan/20 border-accent-cyan text-accent-cyan'
              : 'bg-base-700/50 border-base-600 text-zinc-300 hover:border-accent-cyan/40'}
            `}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-300">
            <span>透明度</span>
            <span className="font-mono text-accent-cyan">{style.opacity.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={style.opacity}
            onChange={(e) => setStyle({ opacity: parseFloat(e.target.value) })}
            className="w-full accent-accent-cyan h-1.5 bg-base-700 rounded appearance-none cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-300">
            <span>粗糙度</span>
            <span className="font-mono text-accent-cyan">{style.roughness.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={style.roughness}
            onChange={(e) => setStyle({ roughness: parseFloat(e.target.value) })}
            className="w-full accent-accent-cyan h-1.5 bg-base-700 rounded appearance-none cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-300">
            <span>金属度</span>
            <span className="font-mono text-accent-cyan">{style.metalness.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={style.metalness}
            onChange={(e) => setStyle({ metalness: parseFloat(e.target.value) })}
            className="w-full accent-accent-cyan h-1.5 bg-base-700 rounded appearance-none cursor-pointer"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={style.showOutline}
            onChange={(e) => setStyle({ showOutline: e.target.checked })}
            className="accent-accent-cyan"
          />
          <span>显示轮廓</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={style.showWireframe}
            onChange={(e) => setStyle({ showWireframe: e.target.checked })}
            className="accent-accent-cyan"
          />
          <span>线框模式</span>
        </label>
      </div>

      <div className="pt-3 border-t border-base-700">
        <div className="flex items-center gap-2 text-accent-success font-semibold mb-3">
          <Layers className="w-4 h-4" />
          <span>性能</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={style.frustumCulling}
              onChange={(e) => setStyle({ frustumCulling: e.target.checked })}
              className="accent-accent-cyan"
            />
            <span>视锥剔除</span>
          </label>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-zinc-300">
              <span>LOD 偏移</span>
              <span className="font-mono text-accent-cyan">{style.lodBias.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="-1"
              max="2"
              step="0.1"
              value={style.lodBias}
              onChange={(e) => setStyle({ lodBias: parseFloat(e.target.value) })}
              className="w-full accent-accent-cyan h-1.5 bg-base-700 rounded appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-base-700">
        <div className="flex items-center gap-2 text-accent-orange font-semibold mb-3">
          <Download className="w-4 h-4" />
          <span>剖面导出</span>
        </div>
        {clip.enabled ? (
          <div className="space-y-2">
            <div className="text-xs text-zinc-400">
              当前剖切: <span className="text-zinc-200 font-mono">{clip.axis.toUpperCase()} = {clip.position.toFixed(2)}m</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => downloadSectionImage(pipelines, clip.position, clip.axis)}
                className="px-3 py-2 text-xs rounded bg-accent-orange/20 border border-accent-orange/40 text-accent-orange hover:bg-accent-orange/30 transition-colors"
              >
                导出 PNG
              </button>
              <button
                onClick={() => downloadSectionSVG(pipelines, clip.position, clip.axis)}
                className="px-3 py-2 text-xs rounded bg-accent-cyan/20 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/30 transition-colors"
              >
                导出 SVG
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <Eye className="w-3 h-3" />
            请先启用剖切功能
          </div>
        )}
      </div>
    </div>
  );
}
