import { useScene } from '@/store/scene';
import { apiClient } from '@/lib/api';
import {
  MousePointer2,
  Ruler,
  Tag,
  Scissors,
  AlertTriangle,
  Play,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { ToolMode } from '@/store/scene';

const tools: { id: ToolMode; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: '选择' },
  { id: 'measure', icon: Ruler, label: '测量' },
  { id: 'annotate', icon: Tag, label: '标注' },
  { id: 'clip', icon: Scissors, label: '剖切' },
  { id: 'collision', icon: AlertTriangle, label: '碰撞检测' },
];

export default function Toolbar() {
  const tool = useScene((s) => s.tool);
  const setTool = useScene((s) => s.setTool);
  const setCollisions = useScene((s) => s.setCollisions);
  const setLoading = useScene((s) => s.setLoading);
  const clearMeasurePoints = useScene((s) => s.clearMeasurePoints);
  const clip = useScene((s) => s.clip);
  const setClip = useScene((s) => s.setClip);

  const runCollision = async () => {
    setLoading(true);
    try {
      const res = await apiClient.detectCollision({ threshold: 0.15 });
      setCollisions(res.conflicts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel tech-border rounded-md px-2 py-1.5 flex items-center gap-1">
      {tools.map((t) => {
        const Icon = t.icon;
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            onClick={() => {
              setTool(t.id);
              clearMeasurePoints();
              if (t.id === 'clip') {
                setClip({ enabled: !clip.enabled });
              }
              if (t.id === 'collision') {
                runCollision();
              }
            }}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all ${
              active
                ? 'bg-accent-cyan/20 text-accent-cyan shadow-glow'
                : 'text-zinc-300 hover:bg-accent-cyan/10 hover:text-accent-cyan'
            }`}
            title={t.label}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{t.label}</span>
            {t.id === 'collision' && (
              <Play className="w-3 h-3 ml-0.5 opacity-70" />
            )}
          </button>
        );
      })}

      <div className="w-px h-5 bg-accent-cyan/20 mx-1" />

      <button
        onClick={() => setClip({ enabled: !clip.enabled })}
        className={`p-1.5 rounded text-xs transition-all ${
          clip.enabled
            ? 'bg-accent-orange/20 text-accent-orange'
            : 'text-zinc-400 hover:text-accent-orange'
        }`}
        title={clip.enabled ? '隐藏剖切平面' : '显示剖切平面'}
      >
        {clip.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
