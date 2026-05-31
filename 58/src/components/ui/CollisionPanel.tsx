import { useScene } from '@/store/scene';
import { AlertTriangle, X, MapPin } from 'lucide-react';
import { PIPELINE_TYPE_COLOR, PIPELINE_TYPE_LABEL } from '@shared/types';

export default function CollisionPanel() {
  const collisions = useScene((s) => s.collisions);
  const pipelines = useScene((s) => s.pipelines);
  const selectedId = useScene((s) => s.selectedId);
  const select = useScene((s) => s.select);
  const setCollisions = useScene((s) => s.setCollisions);
  const loading = useScene((s) => s.loading);

  const dangerCount = collisions.filter((c) => c.level === 'danger').length;
  const warningCount = collisions.filter((c) => c.level === 'warning').length;

  return (
    <div className="glass-panel tech-border rounded-md p-3 text-sm w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-accent-cyan/20">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-accent-danger" />
          <span className="font-display tracking-wider text-accent-danger">
            碰撞检测
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-accent-danger">
            严重 {dangerCount}
          </span>
          <span className="text-accent-orange">
            警告 {warningCount}
          </span>
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs animate-pulseSoft">
          正在分析管线空间关系...
        </div>
      )}

      {!loading && collisions.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 text-xs gap-2">
          <MapPin className="w-6 h-6 opacity-40" />
          <div>点击工具栏"碰撞检测"开始分析</div>
        </div>
      )}

      {!loading && collisions.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {collisions.map((c) => {
            const a = pipelines.find((p) => p.id === c.a);
            const b = pipelines.find((p) => p.id === c.b);
            const isSelected = selectedId === c.a || selectedId === c.b;
            return (
              <div
                key={c.id}
                className={`p-2 rounded border text-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'border-accent-cyan/50 bg-accent-cyan/10'
                    : 'border-zinc-700/40 bg-base-950/40 hover:border-accent-cyan/30'
                }`}
                onClick={() => select(c.a)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        c.level === 'danger'
                          ? 'bg-accent-danger animate-pulseSoft'
                          : 'bg-accent-orange'
                      }`}
                    />
                    <span
                      className={`font-semibold ${
                        c.level === 'danger' ? 'text-accent-danger' : 'text-accent-orange'
                      }`}
                    >
                      {c.level === 'danger' ? '严重冲突' : '警告'}
                    </span>
                  </div>
                  <span className="text-zinc-400 font-mono">
                    {c.distance.toFixed(3)}m
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {a && (
                    <span
                      className="px-1.5 rounded"
                      style={{
                        background: `${PIPELINE_TYPE_COLOR[a.type]}22`,
                        color: PIPELINE_TYPE_COLOR[a.type],
                      }}
                    >
                      {a.code}
                    </span>
                  )}
                  <span className="text-zinc-500">×</span>
                  {b && (
                    <span
                      className="px-1.5 rounded"
                      style={{
                        background: `${PIPELINE_TYPE_COLOR[b.type]}22`,
                        color: PIPELINE_TYPE_COLOR[b.type],
                      }}
                    >
                      {b.code}
                    </span>
                  )}
                  <button
                    className="ml-auto text-zinc-500 hover:text-accent-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollisions(collisions.filter((x) => x.id !== c.id));
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[10px] text-zinc-500 mt-1 font-mono">
                  位置: [{c.point.map((v) => v.toFixed(1)).join(', ')}]
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { PIPELINE_TYPE_LABEL };
