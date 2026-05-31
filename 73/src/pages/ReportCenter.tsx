import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Download, FileSpreadsheet, FileText, File, BarChart3, Check, AlertCircle } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useFilterStore } from '@/store/useFilterStore';
import { generateReport } from '@/services/reportExport';
import { calcEcoIndices } from '@/services/ecoIndex';
import { LoadingSpinner } from '@/components/common';
import { isValidDate, isValidStationId } from '@/utils/validate';
import type { ReportConfig, EcoIndexResult, FusedMonitoringData } from '@/types';

const ReportCenter: React.FC = () => {
  const { stations, fusedData, loading, fetchFusedData } = useDataStore();
  const { dateRange, stationIds, setDateRange, setStationIds, page, pageSize } = useFilterStore();
  const isFetchingRef = useRef(false);

  const [title, setTitle] = useState('水质监测报表');
  const [startDate, setStartDate] = useState(dateRange[0]);
  const [endDate, setEndDate] = useState(dateRange[1]);
  const [selectedStations, setSelectedStations] = useState<string[]>(stationIds);
  const [indicators, setIndicators] = useState({
    waterQuality: true,
    nutrients: true,
    plankton: true,
    ecoIndex: true,
  });
  const [format, setFormat] = useState<'excel' | 'pdf' | 'csv'>('excel');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = '请输入报表标题';
    }

    if (!startDate || !isValidDate(startDate)) {
      newErrors.startDate = '请选择有效的开始日期';
    }

    if (!endDate || !isValidDate(endDate)) {
      newErrors.endDate = '请选择有效的结束日期';
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      newErrors.dateRange = '开始日期不能晚于结束日期';
    }

    if (selectedStations.length === 0) {
      newErrors.stations = '请至少选择一个监测站点';
    }

    if (!indicators.waterQuality && !indicators.nutrients && !indicators.plankton && !indicators.ecoIndex) {
      newErrors.indicators = '请至少选择一个指标类型';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const config: ReportConfig = useMemo(() => ({
    title,
    period: { start: startDate, end: endDate },
    stations: selectedStations,
    indicators,
    format,
    includeCharts,
  }), [title, startDate, endDate, selectedStations, indicators, format, includeCharts]);

  const ecoResults: EcoIndexResult[] = useMemo(() => {
    if (!fusedData?.data) return [];
    return fusedData.data.map((d: FusedMonitoringData) => calcEcoIndices(d));
  }, [fusedData]);

  useEffect(() => {
    if (selectedStations.length > 0 && startDate && endDate) {
      setDateRange([startDate, endDate]);
      setStationIds(selectedStations);

      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      const params = {
        page,
        pageSize,
        startTime: startDate || undefined,
        endTime: endDate || undefined,
        stationId: selectedStations.length === 1 ? selectedStations[0] : undefined,
      };

      fetchFusedData(params).finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, [selectedStations.join(','), startDate, endDate, page, pageSize]);

  const handleStationToggle = (stationId: string) => {
    if (!isValidStationId(stationId)) return;
    setSelectedStations((prev) =>
      prev.includes(stationId)
        ? prev.filter((s) => s !== stationId)
        : [...prev, stationId]
    );
  };

  const handleIndicatorToggle = (key: keyof typeof indicators) => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExport = async () => {
    if (!validateForm() || !fusedData?.data) return;

    setExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      generateReport(fusedData.data, config);
    } finally {
      setExporting(false);
    }
  };

  const getPreviewHeaders = (): string[] => {
    const headers: string[] = ['时间', '站点'];
    if (indicators.waterQuality) {
      headers.push('水温', 'pH', '溶解氧', '电导率', '浊度');
    }
    if (indicators.nutrients) {
      headers.push('总氮', '总磷', '氨氮', '硝酸盐氮');
    }
    if (indicators.plankton) {
      headers.push('浮游植物密度', '浮游动物密度');
    }
    return headers;
  };

  const getPreviewRows = (): string[][] => {
    if (!fusedData?.data) return [];
    return fusedData.data.slice(0, 10).map((d: FusedMonitoringData) => {
      const row: string[] = [d.timestamp, d.stationName];
      if (indicators.waterQuality) {
        row.push(
          String(d.waterQuality.temperature),
          String(d.waterQuality.ph),
          String(d.waterQuality.dissolvedOxygen),
          String(d.waterQuality.conductivity),
          String(d.waterQuality.turbidity)
        );
      }
      if (indicators.nutrients) {
        row.push(
          String(d.nutrient.totalNitrogen),
          String(d.nutrient.totalPhosphorus),
          String(d.nutrient.ammoniaNitrogen),
          String(d.nutrient.nitrateNitrogen)
        );
      }
      if (indicators.plankton) {
        const phyto = d.plankton.filter((p) => p.category === 'phytoplankton').reduce((s, p) => s + p.density, 0);
        const zoo = d.plankton.filter((p) => p.category === 'zooplankton').reduce((s, p) => s + p.density, 0);
        row.push(String(phyto), String(zoo));
      }
      return row;
    });
  };

  const getTrophicLevelLabel = (level: string): { label: string; color: string } => {
    const map: Record<string, { label: string; color: string }> = {
      oligotrophic: { label: '贫营养', color: 'text-green-600 bg-green-100' },
      mesotrophic: { label: '中营养', color: 'text-blue-600 bg-blue-100' },
      eutrophic: { label: '富营养', color: 'text-orange-600 bg-orange-100' },
      hypertrophic: { label: '重富营养', color: 'text-red-600 bg-red-100' },
    };
    return map[level] || { label: level, color: 'text-gray-600 bg-gray-100' };
  };

  const getWaterQualityLabel = (level: string): { label: string; color: string } => {
    const map: Record<string, { label: string; color: string }> = {
      excellent: { label: '优', color: 'text-green-600 bg-green-100' },
      good: { label: '良', color: 'text-blue-600 bg-blue-100' },
      moderate: { label: '中', color: 'text-yellow-600 bg-yellow-100' },
      poor: { label: '差', color: 'text-orange-600 bg-orange-100' },
      bad: { label: '极差', color: 'text-red-600 bg-red-100' },
    };
    return map[level] || { label: level, color: 'text-gray-600 bg-gray-100' };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: '#1e3a5f' }}>报表中心</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-semibold" style={{ color: '#1e3a5f' }}>报表配置</h2>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">报表标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition ${
                  errors.title ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="请输入报表标题"
              />
              {errors.title && (
                <p className="text-red-500 text-xs flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{errors.title}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">开始日期</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition ${
                    errors.startDate || errors.dateRange ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.startDate && (
                  <p className="text-red-500 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{errors.startDate}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">结束日期</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition ${
                    errors.endDate || errors.dateRange ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.endDate && (
                  <p className="text-red-500 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{errors.endDate}
                  </p>
                )}
              </div>
            </div>
            {errors.dateRange && (
              <p className="text-red-500 text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{errors.dateRange}
              </p>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">监测站点</label>
              <div className={`max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1 ${
                errors.stations ? 'border-red-500' : 'border-gray-300'
              }`}>
                {stations.map((station) => (
                  <label
                    key={station.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStations.includes(station.id)}
                      onChange={() => handleStationToggle(station.id)}
                      className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700">{station.name}</span>
                  </label>
                ))}
              </div>
              {errors.stations && (
                <p className="text-red-500 text-xs flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{errors.stations}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">指标选择</label>
              <div className={`grid grid-cols-2 gap-2 ${errors.indicators ? '' : ''}`}>
                {[
                  { key: 'waterQuality' as const, label: '水质指标' },
                  { key: 'nutrients' as const, label: '营养盐' },
                  { key: 'plankton' as const, label: '浮游生物' },
                  { key: 'ecoIndex' as const, label: '生态指标' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleIndicatorToggle(key)}
                    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition font-medium text-sm ${
                      indicators[key]
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {indicators[key] && <Check className="w-4 h-4" />}
                    {label}
                  </button>
                ))}
              </div>
              {errors.indicators && (
                <p className="text-red-500 text-xs flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{errors.indicators}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">导出格式</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'excel' as const, label: 'Excel', icon: FileSpreadsheet, color: '#22c55e' },
                  { key: 'pdf' as const, label: 'PDF', icon: FileText, color: '#ef4444' },
                  { key: 'csv' as const, label: 'CSV', icon: File, color: '#3b82f6' },
                ].map(({ key, label, icon: Icon, color }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFormat(key)}
                    className={`flex flex-col items-center gap-1 px-3 py-3 rounded-lg border-2 transition ${
                      format === key
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-6 h-6" style={{ color }} />
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">包含图表</span>
              </div>
              <button
                type="button"
                onClick={() => setIncludeCharts(!includeCharts)}
                className={`relative w-12 h-6 rounded-full transition ${
                  includeCharts ? 'bg-teal-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    includeCharts ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {exporting ? (
                <LoadingSpinner text="正在导出..." />
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  导出报表
                </>
              )}
            </button>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          {indicators.ecoIndex && ecoResults.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4" style={{ color: '#1e3a5f' }}>生态指标计算结果</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ecoResults.slice(0, 6).map((result, idx) => {
                  const trophic = getTrophicLevelLabel(result.trophicLevel);
                  const waterQuality = getWaterQualityLabel(result.waterQualityLevel);
                  return (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gradient-to-br from-gray-50 to-white">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-600">
                          {stations.find((s) => s.id === result.stationId)?.name || result.stationId}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${trophic.color}`}>
                          {trophic.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs">Shannon指数</p>
                          <p className="font-semibold" style={{ color: '#1e3a5f' }}>{result.shannonIndex.toFixed(3)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Simpson指数</p>
                          <p className="font-semibold" style={{ color: '#1e3a5f' }}>{result.simpsonIndex.toFixed(3)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">均匀度指数</p>
                          <p className="font-semibold" style={{ color: '#2dd4bf' }}>{result.evennessIndex.toFixed(3)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Margalef指数</p>
                          <p className="font-semibold" style={{ color: '#2dd4bf' }}>{result.margalefIndex.toFixed(3)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">营养状态指数</p>
                          <p className="font-semibold" style={{ color: '#f97316' }}>{result.trophicLevelIndex.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">水质等级</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${waterQuality.color}`}>
                            {waterQuality.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4" style={{ color: '#1e3a5f' }}>报表预览</h2>
            {loading ? (
              <LoadingSpinner text="正在加载数据..." />
            ) : !fusedData?.data || fusedData.data.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>请选择站点和时间范围以预览报表数据</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#1e3a5f' }}>
                      {getPreviewHeaders().map((header, idx) => (
                        <th key={idx} className="px-4 py-3 text-left font-semibold text-white">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getPreviewRows().map((row, rowIdx) => (
                      <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className="px-4 py-2 border-t border-gray-100 text-gray-700">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fusedData.data.length > 10 && (
                  <p className="text-center text-sm text-gray-500 mt-3">
                    显示前 10 条，共 {fusedData.data.length} 条数据
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportCenter;
