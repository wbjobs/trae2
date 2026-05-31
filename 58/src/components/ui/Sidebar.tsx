import { useScene } from '@/store/scene';
import { PIPELINE_TYPE_COLOR, PIPELINE_TYPE_LABEL } from '@shared/types';
import type { Pipeline, PipelineType } from '@shared/types';
import {
  Layers,
  ChevronDown,
  ChevronRight,
  Search,
  Eye,
  EyeOff,
  Droplets,
  Zap,
  Wind,
  Cable,
  Flame,
} from 'lucide-react';
import { useState } from 'react';

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  water_supply: Droplets,
  drainage: Layers,
  gas: Wind,
  power: Zap,
  telecom: Cable,
  heating: Flame,
};

const TYPES: PipelineType[] = [
  'water_supply',
  'drainage',
  'gas',
  'power',
  'telecom',
  'heating',
];

export default function Sidebar() {
  const pipelines = useScene((s) => s.pipelines);
  const sections = useScene((s) => s.sections);
  const hoveredId = useScene((s) => s.hoveredId);
  const selectedId = useScene((s) => s.selectedId);
  const select = useScene((s) => s.select);
  const hover = useScene((s) => s.hover);
  const hiddenTypes = useScene((s) => s.hiddenTypes);
  const toggleHiddenType = useScene((s) => s.toggleHiddenType);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ all: true });

  const filtered = pipelines.filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.material.toLowerCase().includes(q)
    );
  });

  return (
    <div className="glass-panel tech-border rounded-md p-3 text-sm h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-accent-cyan/20">
        <Layers className="w-4 h-4 text-accent-cyan" />
        <span className="font-display tracking-wider text-accent-cyan">管线目录</span>
      </div>

      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索编号/材质..."
          className="w-full pl-7 pr-2 py-1.5 text-xs bg-base-950/60 border border-accent-cyan/20 rounded focus:outline-none focus:border-accent-cyan/50 text-zinc-200 placeholder-zinc-500"
        />
      </div>

      <div className="space-y-1 mb-3">
        {TYPES.map((t) => {
          const Icon = typeIcons[t] || Layers;
          const hidden = hiddenTypes.has(t);
          const count = pipelines.filter((p) => p.type === t).length;
          return (
            <div
              key={t}
              className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-base-800/40"
            >
              <button
                onClick={() => toggleHiddenType(t)}
                className="text-zinc-400 hover:text-accent-cyan"
              >
                {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
              <Icon
                className="w-3.5 h-3.5"
                style={{ color: PIPELINE_TYPE_COLOR[t] }}
              />
              <span className="text-zinc-300 flex-1">
                {PIPELINE_TYPE_LABEL[t]}
              </span>
              <span className="text-zinc-500">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {sections.map((sec) => {
          const isOpen = expanded[sec.id] ?? true;
          const list = filtered.filter((p) => p.sectionId === sec.id);
          return (
            <div key={sec.id}>
              <button
                onClick={() => setExpanded((e) => ({ ...e, [sec.id]: !isOpen }))}
                className="w-full flex items-center gap-1 py-1 text-xs text-zinc-400 hover:text-accent-cyan"
              >
                {isOpen ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>{sec.name}</span>
                <span className="ml-auto text-zinc-500">{list.length}</span>
              </button>
              {isOpen &&
                list.map((p) => (
                  <PipelineRow
                    key={p.id}
                    pipeline={p}
                    isHover={hoveredId === p.id}
                    isSelected={selectedId === p.id}
                    onHover={hover}
                    onSelect={select}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineRow({
  pipeline,
  isHover,
  isSelected,
  onHover,
  onSelect,
}: {
  pipeline: Pipeline;
  isHover: boolean;
  isSelected: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const Icon = typeIcons[pipeline.type] || Layers;
  return (
    <div
      className={`flex items-center gap-2 pl-5 pr-2 py-1 text-xs rounded cursor-pointer transition-all ${
        isSelected
          ? 'bg-accent-cyan/15 text-accent-cyan'
          : isHover
            ? 'bg-base-800/60 text-zinc-200'
            : 'text-zinc-400 hover:bg-base-800/40'
      }`}
      onMouseEnter={() => onHover(pipeline.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(pipeline.id)}
    >
      <Icon
        className="w-3 h-3 flex-shrink-0"
        style={{ color: PIPELINE_TYPE_COLOR[pipeline.type] }}
      />
      <span className="font-mono">{pipeline.code}</span>
      <span className="ml-auto text-[10px] text-zinc-500">
        Ø{pipeline.diameter}
      </span>
    </div>
  );
}
