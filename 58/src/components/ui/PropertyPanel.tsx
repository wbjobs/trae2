import { useScene } from '@/store/scene';
import { PIPELINE_TYPE_COLOR, PIPELINE_TYPE_LABEL } from '@shared/types';
import { Info, Ruler, Layers, Zap, Droplets, Flame, Cable, Wind, AlertTriangle } from 'lucide-react';

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  water_supply: Droplets,
  drainage: Layers,
  gas: Wind,
  power: Zap,
  telecom: Cable,
  heating: Flame,
};

export default function PropertyPanel() {
  const pipelines = useScene((s) => s.pipelines);
  const selectedId = useScene((s) => s.selectedId);
  const collisions = useScene((s) => s.collisions);

  const selected = pipelines.find((p) => p.id === selectedId);
  const relatedConflicts = collisions.filter(
    (c) => selectedId && (c.a === selectedId || c.b === selectedId),
  );

  return (
    <div className="glass-panel tech-border rounded-md p-3 text-sm w-full h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-accent-cyan/20">
        <Info className="w-4 h-4 text-accent-cyan" />
        <span className="font-display tracking-wider text-accent-cyan">属性信息</span>
      </div>

      {!selected && (
        <div className="text-zinc-400 text-xs py-6 text-center">
          请在三维场景中点击管线以查看属性
        </div>
      )}

      {selected && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = typeIcons[selected.type] || Layers;
              return (
                <Icon
                  className="w-4 h-4"
                  style={{ color: PIPELINE_TYPE_COLOR[selected.type] }}
                />
              );
            })()}
            <span className="font-mono text-base">{selected.code}</span>
            <span
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                background: `${PIPELINE_TYPE_COLOR[selected.type]}22`,
                color: PIPELINE_TYPE_COLOR[selected.type],
              }}
            >
              {PIPELINE_TYPE_LABEL[selected.type]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <Field label="材质" value={selected.material} />
            <Field label="管径" value={`${selected.diameter} mm`} />
            <Field label="标高" value={`${selected.elevation} m`} />
            <Field label="埋深" value={`${selected.depth} m`} />
            <Field label="压力" value={`${selected.pressure} MPa`} />
            <Field label="安装日期" value={selected.installedAt} />
          </div>

          <div className="pt-2 border-t border-accent-cyan/10">
            <div className="text-xs text-zinc-400 mb-1">起点坐标</div>
            <div className="font-mono text-xs text-zinc-300">
              [{selected.startPoint.map((v) => v.toFixed(2)).join(', ')}]
            </div>
            <div className="text-xs text-zinc-400 mb-1 mt-2">终点坐标</div>
            <div className="font-mono text-xs text-zinc-300">
              [{selected.endPoint.map((v) => v.toFixed(2)).join(', ')}]
            </div>
          </div>

          {relatedConflicts.length > 0 && (
            <div className="pt-2 border-t border-accent-cyan/10">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-accent-danger" />
                <span className="text-xs text-accent-danger font-semibold">
                  相关冲突 ({relatedConflicts.length})
                </span>
              </div>
              {relatedConflicts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-1 px-2 rounded bg-base-800/50 text-xs mb-1"
                >
                  <span className="font-mono">
                    {c.a === selected.id ? c.b : c.a}
                  </span>
                  <span
                    className={`px-1.5 rounded ${
                      c.level === 'danger'
                        ? 'bg-accent-danger/20 text-accent-danger'
                        : 'bg-accent-orange/20 text-accent-orange'
                    }`}
                  >
                    {c.distance.toFixed(3)}m
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-zinc-400 text-[11px]">{label}</div>
      <div className="text-zinc-200 font-medium">{value}</div>
    </div>
  );
}

export { Ruler };
