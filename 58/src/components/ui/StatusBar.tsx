import { useScene } from '@/store/scene';
import { Activity, MousePointer2, Crosshair } from 'lucide-react';

export default function StatusBar() {
  const pipelines = useScene((s) => s.pipelines);
  const collisions = useScene((s) => s.collisions);
  const clip = useScene((s) => s.clip);
  const tool = useScene((s) => s.tool);
  const measurePoints = useScene((s) => s.measurePoints);
  const loading = useScene((s) => s.loading);

  return (
    <div className="glass-panel rounded-md px-3 py-1.5 flex items-center gap-4 text-xs text-zinc-400">
      <div className="flex items-center gap-1.5">
        <Activity className="w-3 h-3 text-accent-success animate-pulseSoft" />
        <span>系统在线</span>
      </div>

      <div className="w-px h-3 bg-zinc-700" />

      <div className="flex items-center gap-1.5">
        <MousePointer2 className="w-3 h-3 text-accent-cyan" />
        <span>
          当前工具:{' '}
          <span className="text-accent-cyan">
            {tool === 'select'
              ? '选择'
              : tool === 'measure'
                ? '测量'
                : tool === 'annotate'
                  ? '标注'
                  : tool === 'clip'
                    ? '剖切'
                    : '碰撞检测'}
          </span>
        </span>
      </div>

      <div className="w-px h-3 bg-zinc-700" />

      <div>
        管线数量: <span className="text-zinc-200">{pipelines.length}</span>
      </div>

      <div>
        碰撞:{' '}
        <span className={collisions.length > 0 ? 'text-accent-danger' : 'text-zinc-200'}>
          {collisions.length}
        </span>
      </div>

      {clip.enabled && (
        <>
          <div className="w-px h-3 bg-zinc-700" />
          <div className="flex items-center gap-1.5 text-accent-orange">
            <Crosshair className="w-3 h-3" />
            <span>
              剖切 {clip.axis.toUpperCase()} = {clip.position.toFixed(1)}m
            </span>
          </div>
        </>
      )}

      {tool === 'measure' && measurePoints.length > 0 && (
        <>
          <div className="w-px h-3 bg-zinc-700" />
          <div className="text-accent-cyan">
            已选点: {measurePoints.length}/2
          </div>
        </>
      )}

      {loading && (
        <>
          <div className="w-px h-3 bg-zinc-700" />
          <div className="text-accent-orange animate-pulseSoft">分析中...</div>
        </>
      )}
    </div>
  );
}
