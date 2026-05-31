import { useScene } from '@/store/scene';
import { Scissors, RotateCcw } from 'lucide-react';

export default function ClipControl() {
  const clip = useScene((s) => s.clip);
  const setClip = useScene((s) => s.setClip);

  if (!clip.enabled) return null;

  return (
    <div className="glass-panel tech-border rounded-md p-3 text-sm w-56">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-accent-cyan/20">
        <Scissors className="w-4 h-4 text-accent-orange" />
        <span className="font-display tracking-wider text-accent-orange">
          剖切控制
        </span>
      </div>

      <div className="space-y-2 text-xs">
        <div>
          <div className="text-zinc-400 mb-1">剖切方向</div>
          <div className="flex gap-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <button
                key={axis}
                onClick={() => setClip({ axis, position: 0 })}
                className={`flex-1 py-1 rounded transition-all ${
                  clip.axis === axis
                    ? 'bg-accent-orange/20 text-accent-orange'
                    : 'bg-base-800/50 text-zinc-400 hover:text-accent-orange'
                }`}
              >
                {axis.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-zinc-400">位置</span>
            <span className="font-mono text-accent-orange">
              {clip.position.toFixed(2)} m
            </span>
          </div>
          <input
            type="range"
            min={-60}
            max={60}
            step={0.5}
            value={clip.position}
            onChange={(e) => setClip({ position: Number(e.target.value) })}
            className="w-full accent-accent-orange"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-400">反向剖切</span>
          <button
            onClick={() => setClip({ invert: !clip.invert })}
            className={`px-2 py-0.5 rounded text-xs ${
              clip.invert
                ? 'bg-accent-orange/20 text-accent-orange'
                : 'bg-base-800/50 text-zinc-500'
            }`}
          >
            {clip.invert ? '开启' : '关闭'}
          </button>
        </div>

        <button
          onClick={() => setClip({ position: 0, invert: false, axis: 'x' })}
          className="w-full flex items-center justify-center gap-1 py-1 rounded bg-base-800/50 text-zinc-400 hover:text-accent-orange text-xs"
        >
          <RotateCcw className="w-3 h-3" />
          重置
        </button>
      </div>
    </div>
  );
}
