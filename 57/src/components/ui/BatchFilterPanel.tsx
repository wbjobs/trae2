import { useState, useMemo } from 'react';
import { Filter, CheckSquare, Square, Trash2, Layers, AlertTriangle, Download, Search } from 'lucide-react';
import { useBridgeStore } from '../../store/useBridgeStore';
import { severityColors, severityLabels, defectTypeLabels } from '../../utils/stressColors';
import type { DefectData } from '../../../shared';

interface FilterState {
  types: string[];
  severities: string[];
  layers: string[];
  dateRange: { start: string; end: string };
  search: string;
}

export function BatchFilterPanel() {
  const { defects, layers, removeDefect, updateDefect } = useBridgeStore();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDefects, setSelectedDefects] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    severities: [],
    layers: [],
    dateRange: { start: '', end: '' },
    search: '',
  });

  const filteredDefects = useMemo(() => {
    return defects.filter((defect) => {
      if (filters.types.length > 0 && !filters.types.includes(defect.type)) return false;
      if (filters.severities.length > 0 && !filters.severities.includes(defect.severity)) return false;
      if (filters.layers.length > 0 && !filters.layers.includes(defect.layerId)) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          defect.description?.toLowerCase().includes(searchLower) ||
          defectTypeLabels[defect.type]?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      if (filters.dateRange.start) {
        const defectDate = new Date(defect.detectedAt);
        const startDate = new Date(filters.dateRange.start);
        if (defectDate < startDate) return false;
      }
      if (filters.dateRange.end) {
        const defectDate = new Date(defect.detectedAt);
        const endDate = new Date(filters.dateRange.end);
        if (defectDate > endDate) return false;
      }
      return true;
    });
  }, [defects, filters]);

  const toggleFilter = (category: keyof FilterState, value: string) => {
    setFilters((prev) => {
      const current = prev[category] as string[];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [category]: updated };
    });
  };

  const toggleSelectAll = () => {
    if (selectedDefects.size === filteredDefects.length) {
      setSelectedDefects(new Set());
    } else {
      setSelectedDefects(new Set(filteredDefects.map((d) => d.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedDefects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedDefects.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedDefects.size} 条病害记录吗？`)) return;
    
    for (const id of selectedDefects) {
      await removeDefect(id);
    }
    setSelectedDefects(new Set());
  };

  const handleBatchUpdateLayer = async (layerId: string) => {
    if (selectedDefects.size === 0) return;
    for (const id of selectedDefects) {
      await updateDefect(id, { layerId });
    }
  };

  const handleBatchUpdateSeverity = async (severity: string) => {
    if (selectedDefects.size === 0) return;
    for (const id of selectedDefects) {
      await updateDefect(id, { severity });
    }
  };

  const clearFilters = () => {
    setFilters({
      types: [],
      severities: [],
      layers: [],
      dateRange: { start: '', end: '' },
      search: '',
    });
  };

  const activeFilterCount = 
    filters.types.length + filters.severities.length + filters.layers.length + 
    (filters.search ? 1 : 0) + (filters.dateRange.start || filters.dateRange.end ? 1 : 0);

  return (
    <div className="bg-slate-800/95 backdrop-blur-sm rounded-lg border border-slate-700 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-medium text-slate-200">批量筛选与操作</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-sky-500/20 text-sky-400 text-xs rounded-full">
              {activeFilterCount} 个筛选条件
            </span>
          )}
        </div>
        <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="搜索病害描述..."
              value={filters.search}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-2 block">开始日期</label>
              <input
                type="date"
                value={filters.dateRange.start}
                onChange={(e) => setFilters((p) => ({
                  ...p,
                  dateRange: { ...p.dateRange, start: e.target.value }
                }))}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-2 block">结束日期</label>
              <input
                type="date"
                value={filters.dateRange.end}
                onChange={(e) => setFilters((p) => ({
                  ...p,
                  dateRange: { ...p.dateRange, end: e.target.value }
                }))}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">病害类型</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(defectTypeLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleFilter('types', key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filters.types.includes(key)
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">严重程度</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(severityLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleFilter('severities', key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filters.severities.includes(key)
                      ? 'text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                  style={{
                    backgroundColor: filters.severities.includes(key) ? severityColors[key] : undefined,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">所属图层</label>
            <div className="flex flex-wrap gap-2">
              {layers.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => toggleFilter('layers', layer.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    filters.layers.includes(layer.id)
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: layer.color }}
                  />
                  {layer.name}
                </button>
              ))}
            </div>
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              清除所有筛选条件
            </button>
          )}

          <div className="pt-3 border-t border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm text-slate-300 hover:text-slate-100 transition-colors"
              >
                {selectedDefects.size === filteredDefects.length && filteredDefects.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-sky-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                全选 ({filteredDefects.length} 条)
              </button>
              {selectedDefects.size > 0 && (
                <span className="text-sm text-sky-400">
                  已选择 {selectedDefects.size} 条
                </span>
              )}
            </div>

            {selectedDefects.size > 0 && (
              <div className="flex flex-wrap gap-2">
                <div className="relative group">
                  <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors">
                    <Layers className="w-4 h-4" />
                    移动图层
                    <ChevronDownIcon className="w-3 h-3" />
                  </button>
                  <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-32 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    {layers.map((layer) => (
                      <button
                        key={layer.id}
                        onClick={() => handleBatchUpdateLayer(layer.id)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
                        {layer.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative group">
                  <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors">
                    <AlertTriangle className="w-4 h-4" />
                    修改严重程度
                    <ChevronDownIcon className="w-3 h-3" />
                  </button>
                  <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-32 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    {Object.entries(severityLabels).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => handleBatchUpdateSeverity(key)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: severityColors[key] }} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors">
                  <Download className="w-4 h-4" />
                  导出数据
                </button>

                <button
                  onClick={handleBatchDelete}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  批量删除
                </button>
              </div>
            )}
          </div>

          {filteredDefects.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-2 pt-2">
              {filteredDefects.map((defect) => (
                <div
                  key={defect.id}
                  onClick={() => toggleSelect(defect.id)}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedDefects.has(defect.id)
                      ? 'bg-sky-500/20 border border-sky-500/50'
                      : 'bg-slate-900/30 hover:bg-slate-700/50 border border-transparent'
                  }`}
                >
                  {selectedDefects.has(defect.id) ? (
                    <CheckSquare className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: severityColors[defect.severity] }}
                      />
                      <span className="text-sm text-slate-200 truncate">
                        {defectTypeLabels[defect.type]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {defect.description || '无描述'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
