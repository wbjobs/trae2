import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Download,
  Upload,
  ArrowRightLeft,
  Table2,
  MapPin,
  ArrowUpDown,
  ChevronLeft,
  Globe,
  Check,
  Search,
  ChevronFirst,
  ChevronLast,
  ChevronDown,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGeoStore } from '@/store';
import { transformCoordinate } from '@/utils/coordinateTransform';
import { boreholeApi } from '@/lib/api';
import type { Borehole } from '@/types';

type CRS = 'WGS84' | 'GCJ02' | 'BD09' | 'XIAN80' | 'BJ54';

const coordinateSystems: { id: CRS; name: string }[] = [
  { id: 'WGS84', name: 'WGS84' },
  { id: 'GCJ02', name: 'GCJ02' },
  { id: 'BD09', name: 'BD09' },
  { id: 'XIAN80', name: 'XIAN80' },
  { id: 'BJ54', name: 'BJ54' },
];

const pageSizeOptions = [10, 20, 50, 100];

export default function DataPage() {
  const { boreholes, setBoreholes, loadMockData } = useGeoStore();
  const [showTransform, setShowTransform] = useState(false);
  const [sourceCRS, setSourceCRS] = useState<CRS>('WGS84');
  const [targetCRS, setTargetCRS] = useState<CRS>('GCJ02');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<keyof Borehole>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [converting, setConverting] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterCRS, setFilterCRS] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [paginatedData, setPaginatedData] = useState<Borehole[]>([]);

  const fetchBoreholes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await boreholeApi.list({
        page,
        pageSize,
        keyword: searchKeyword,
        coordinateSystem: filterCRS || undefined,
      });

      if (response.success) {
        setPaginatedData(response.data);
        setTotal(response.total);
        setTotalPages(response.totalPages);
        if (page === 1) {
          setBoreholes(response.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch boreholes:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchKeyword, filterCRS, setBoreholes]);

  useEffect(() => {
    fetchBoreholes();
  }, [fetchBoreholes]);

  useEffect(() => {
    if (boreholes.length === 0) {
      loadMockData();
    }
  }, [boreholes.length, loadMockData]);

  const handleSearch = () => {
    setSearchKeyword(keyword);
    setPage(1);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSort = (field: keyof Borehole) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedData = [...paginatedData].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  const toggleSelectAll = () => {
    if (selectedRows.size === paginatedData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedData.map((b) => b.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const handleBatchTransform = async () => {
    if (selectedRows.size === 0) return;
    setConverting(true);
    try {
      const updated = paginatedData.map((b) => {
        if (!selectedRows.has(b.id)) return b;
        const [newLon, newLat] = transformCoordinate(
          [b.longitude, b.latitude],
          sourceCRS,
          targetCRS
        );
        return {
          ...b,
          longitude: newLon,
          latitude: newLat,
          coordinateSystem: targetCRS,
        };
      });
      setPaginatedData(updated);
      setConvertSuccess(true);
      setTimeout(() => setConvertSuccess(false), 3000);
    } catch (e) {
      console.error('批量转换失败:', e);
    } finally {
      setConverting(false);
    }
  };

  const handleExport = () => {
    const dataToExport = selectedRows.size > 0
      ? paginatedData.filter((b) => selectedRows.has(b.id))
      : paginatedData;
    const json = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boreholes_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          setBoreholes(data as Borehole[]);
        }
      } catch (err) {
        console.error('导入失败:', err);
      }
    };
    reader.readAsText(file);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      setSelectedRows(new Set());
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    setSelectedRows(new Set());
  };

  const handleFilterChange = (crs: string) => {
    setFilterCRS(crs);
    setPage(1);
    setSelectedRows(new Set());
  };

  const handleReset = () => {
    setKeyword('');
    setSearchKeyword('');
    setFilterCRS('');
    setPage(1);
    setSelectedRows(new Set());
  };

  const SortIcon = ({ field }: { field: keyof Borehole }) => (
    <button
      onClick={() => handleSort(field)}
      className="ml-1 inline-flex items-center text-geo-text-muted hover:text-geo-orange transition-colors"
    >
      <ArrowUpDown
        className={`w-3.5 h-3.5 transition-all ${
          sortField === field ? 'text-geo-orange' : ''
        }`}
      />
    </button>
  );

  return (
    <div className="min-h-screen bg-geo-dark">
      <header className="bg-geo-dark border-b border-geo-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="p-2 rounded-lg hover:bg-geo-dark-light text-geo-text-muted hover:text-geo-text transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <Database className="w-7 h-7 text-geo-orange" />
              <div>
                <h1 className="font-display font-bold text-2xl text-geo-text">数据管理</h1>
                <p className="text-sm text-geo-text-muted">钻孔数据管理与批量坐标转换</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 bg-geo-dark-light hover:bg-geo-dark-hover rounded-lg cursor-pointer transition-colors border border-geo-border hover:border-geo-orange">
                <Upload className="w-4 h-4 text-geo-blue" />
                <span className="text-sm text-geo-text">导入数据</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-geo-dark-light hover:bg-geo-dark-hover rounded-lg transition-colors border border-geo-border hover:border-geo-orange"
              >
                <Download className="w-4 h-4 text-geo-green" />
                <span className="text-sm text-geo-text">
                  导出{selectedRows.size > 0 ? `选中(${selectedRows.size})` : '全部'}
                </span>
              </button>
              <button
                onClick={() => setShowTransform(!showTransform)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors border ${
                  showTransform
                    ? 'bg-geo-orange text-white border-geo-orange'
                    : 'bg-geo-dark-light hover:bg-geo-dark-hover text-geo-text border-geo-border hover:border-geo-orange'
                }`}
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span className="text-sm">批量坐标转换</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {showTransform && (
        <div className="bg-geo-dark-light border-b border-geo-border">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-geo-orange" />
                <span className="text-sm text-geo-text font-medium">批量转换坐标系</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-geo-text-muted">源坐标系:</span>
                <select
                  value={sourceCRS}
                  onChange={(e) => setSourceCRS(e.target.value as CRS)}
                  className="h-9 bg-geo-dark border border-geo-border rounded-lg px-3 text-sm text-geo-text focus:outline-none focus:border-geo-orange"
                >
                  {coordinateSystems.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      {cs.name}
                    </option>
                  ))}
                </select>
              </div>
              <ArrowRightLeft className="w-5 h-5 text-geo-text-muted" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-geo-text-muted">目标坐标系:</span>
                <select
                  value={targetCRS}
                  onChange={(e) => setTargetCRS(e.target.value as CRS)}
                  className="h-9 bg-geo-dark border border-geo-border rounded-lg px-3 text-sm text-geo-text focus:outline-none focus:border-geo-orange"
                >
                  {coordinateSystems.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      {cs.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1" />
              {convertSuccess && (
                <div className="flex items-center gap-1 text-geo-green text-sm">
                  <Check className="w-4 h-4" />
                  转换成功
                </div>
              )}
              <button
                onClick={handleBatchTransform}
                disabled={selectedRows.size === 0 || converting}
                className="px-5 py-2 bg-geo-orange hover:bg-geo-orange-hover disabled:bg-geo-gray disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {converting ? '转换中...' : `转换选中项 (${selectedRows.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-geo-dark-light rounded-xl border border-geo-border overflow-hidden">
          <div className="p-4 border-b border-geo-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Table2 className="w-5 h-5 text-geo-orange" />
                  <span className="font-display font-semibold text-geo-text">钻孔数据</span>
                  <span className="px-2 py-0.5 bg-geo-dark rounded text-xs text-geo-text-muted">
                    共 {total} 条
                  </span>
                  {selectedRows.size > 0 && (
                    <span className="px-2 py-0.5 bg-geo-orange/20 rounded text-xs text-geo-orange">
                      已选 {selectedRows.size} 条
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-geo-text-muted" />
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="搜索钻孔名称..."
                    className="h-9 bg-geo-dark border border-geo-border rounded-lg pl-10 pr-4 text-sm text-geo-text placeholder-geo-text-muted focus:outline-none focus:border-geo-orange w-64"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-geo-text-muted" />
                  <select
                    value={filterCRS}
                    onChange={(e) => handleFilterChange(e.target.value)}
                    className="h-9 bg-geo-dark border border-geo-border rounded-lg px-3 text-sm text-geo-text focus:outline-none focus:border-geo-orange"
                  >
                    <option value="">全部坐标系</option>
                    {coordinateSystems.map((cs) => (
                      <option key={cs.id} value={cs.id}>
                        {cs.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 px-3 py-2 bg-geo-dark hover:bg-geo-dark-hover rounded-lg text-sm text-geo-text-muted hover:text-geo-text transition-colors border border-geo-border"
                >
                  <RefreshCw className="w-4 h-4" />
                  重置
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-geo-dark">
                  <th className="px-4 py-3 text-left w-12">
                    <input
                      type="checkbox"
                      checked={selectedRows.size === paginatedData.length && paginatedData.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-geo-border bg-geo-dark text-geo-orange focus:ring-geo-orange"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-display font-semibold text-geo-text-muted uppercase tracking-wider">
                      编号 <SortIcon field="name" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-display font-semibold text-geo-text-muted uppercase tracking-wider">
                      经度 <SortIcon field="longitude" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-display font-semibold text-geo-text-muted uppercase tracking-wider">
                      纬度 <SortIcon field="latitude" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-display font-semibold text-geo-text-muted uppercase tracking-wider">
                      高程 <SortIcon field="elevation" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-display font-semibold text-geo-text-muted uppercase tracking-wider">
                      孔深 <SortIcon field="depth" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-display font-semibold text-geo-text-muted uppercase tracking-wider">
                      坐标系 <SortIcon field="coordinateSystem" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-display font-semibold text-geo-text-muted uppercase tracking-wider">
                      分层数
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-geo-border">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <RefreshCw className="w-8 h-8 mx-auto mb-3 text-geo-orange animate-spin" />
                      <p className="text-geo-text-muted">加载中...</p>
                    </td>
                  </tr>
                ) : sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <Database className="w-12 h-12 mx-auto mb-3 text-geo-text-muted opacity-30" />
                      <p className="text-geo-text-muted">暂无钻孔数据</p>
                      <button
                        onClick={loadMockData}
                        className="mt-4 px-4 py-2 bg-geo-orange hover:bg-geo-orange-hover text-white rounded-lg text-sm transition-colors"
                      >
                        加载示例数据
                      </button>
                    </td>
                  </tr>
                ) : (
                  sortedData.map((borehole) => (
                    <tr
                      key={borehole.id}
                      className={`hover:bg-geo-dark/50 transition-colors ${
                        selectedRows.has(borehole.id) ? 'bg-geo-orange/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(borehole.id)}
                          onChange={() => toggleSelectRow(borehole.id)}
                          className="w-4 h-4 rounded border-geo-border bg-geo-dark text-geo-orange focus:ring-geo-orange"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-geo-orange" />
                          <span className="font-mono text-sm text-geo-text font-medium">
                            {borehole.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-geo-orange">
                        {borehole.longitude.toFixed(6)}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-geo-green">
                        {borehole.latitude.toFixed(6)}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-geo-blue">
                        {borehole.elevation.toFixed(2)} m
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-geo-text">
                        {borehole.depth.toFixed(2)} m
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-geo-dark rounded text-xs font-mono text-geo-text-muted">
                          {borehole.coordinateSystem}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-geo-orange/20 rounded text-xs text-geo-orange font-medium">
                          {borehole.layers.length} 层
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-geo-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-geo-text-muted">每页显示:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="h-8 bg-geo-dark border border-geo-border rounded-lg px-2 text-sm text-geo-text focus:outline-none focus:border-geo-orange"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size} 条
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(1)}
                disabled={page === 1 || loading}
                className="p-2 bg-geo-dark hover:bg-geo-dark-hover rounded-lg text-geo-text-muted hover:text-geo-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronFirst className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1 || loading}
                className="p-2 bg-geo-dark hover:bg-geo-dark-hover rounded-lg text-geo-text-muted hover:text-geo-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-geo-text px-3">
                第 <span className="text-geo-orange font-medium">{page}</span> 页 / 共 {totalPages} 页
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages || loading}
                className="p-2 bg-geo-dark hover:bg-geo-dark-hover rounded-lg text-geo-text-muted hover:text-geo-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors rotate-180"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={page === totalPages || loading}
                className="p-2 bg-geo-dark hover:bg-geo-dark-hover rounded-lg text-geo-text-muted hover:text-geo-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors rotate-180"
              >
                <ChevronFirst className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-geo-text-muted">跳转到:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={page}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 1 && val <= totalPages) {
                    handlePageChange(val);
                  }
                }}
                className="w-16 h-8 bg-geo-dark border border-geo-border rounded-lg px-2 text-sm text-geo-text focus:outline-none focus:border-geo-orange text-center"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
