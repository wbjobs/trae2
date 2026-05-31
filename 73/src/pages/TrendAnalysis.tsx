import React, { useState, useEffect, useRef } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { useFilterStore } from '@/store/useFilterStore';
import { LineChart } from '@/components/charts';
import { Pagination, FilterBar } from '@/components/common';
import PageContainer from '@/components/layout/PageContainer';
import { calcEcoIndices } from '@/services/ecoIndex';

const TrendAnalysis: React.FC = () => {
  const { stations, fusedData, loading, fetchStations, fetchFusedData } = useDataStore();
  const { page, pageSize, dateRange, stationIds, setDateRange, setStationIds, setPage, setPageSize } = useFilterStore();
  const [visibleIndicators, setVisibleIndicators] = useState<string[]>(['temperature', 'ph', 'dissolvedOxygen', 'totalNitrogen', 'totalPhosphorus']);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  useEffect(() => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    
    const params = {
      page,
      pageSize,
      startTime: dateRange[0] || undefined,
      endTime: dateRange[1] || undefined,
      stationId: stationIds.length === 1 ? stationIds[0] : undefined,
    };
    
    fetchFusedData(params).finally(() => {
      isFetchingRef.current = false;
    });
  }, [page, pageSize, dateRange[0], dateRange[1], stationIds.join(',')]);

  const indicatorConfig = [
    { key: 'temperature', name: '水温', color: '#ef4444', unit: '°C' },
    { key: 'ph', name: 'pH', color: '#3b82f6', unit: '' },
    { key: 'dissolvedOxygen', name: '溶解氧', color: '#10b981', unit: 'mg/L' },
    { key: 'totalNitrogen', name: '总氮', color: '#f59e0b', unit: 'mg/L' },
    { key: 'totalPhosphorus', name: '总磷', color: '#8b5cf6', unit: 'mg/L' },
  ];

  const toggleIndicator = (key: string) => {
    setVisibleIndicators(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const processWaterQualityData = () => {
    if (!fusedData?.data.length) return { xData: [], series: [] };
    
    const sortedData = [...fusedData.data].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const xData = sortedData.map(d => {
      const date = new Date(d.timestamp);
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    });

    const series = indicatorConfig
      .filter(config => visibleIndicators.includes(config.key))
      .map(config => ({
        name: config.name,
        data: sortedData.map(d => {
          if (config.key === 'temperature') return d.waterQuality.temperature;
          if (config.key === 'ph') return d.waterQuality.ph;
          if (config.key === 'dissolvedOxygen') return d.waterQuality.dissolvedOxygen;
          if (config.key === 'totalNitrogen') return d.nutrient.totalNitrogen;
          if (config.key === 'totalPhosphorus') return d.nutrient.totalPhosphorus;
          return 0;
        })
      }));

    return { xData, series };
  };

  const processPlanktonData = () => {
    if (!fusedData?.data.length) return { xData: [], series: [] };
    
    const sortedData = [...fusedData.data].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const xData = sortedData.map(d => {
      const date = new Date(d.timestamp);
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    });

    const series = [
      {
        name: '浮游植物密度',
        data: sortedData.map(d => 
          d.plankton.filter(p => p.category === 'phytoplankton').reduce((sum, p) => sum + p.density, 0)
        )
      },
      {
        name: '浮游动物密度',
        data: sortedData.map(d => 
          d.plankton.filter(p => p.category === 'zooplankton').reduce((sum, p) => sum + p.density, 0)
        )
      }
    ];

    return { xData, series };
  };

  const processEcoIndexData = () => {
    if (!fusedData?.data.length) return { xData: [], series: [] };
    
    const sortedData = [...fusedData.data].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const xData = sortedData.map(d => {
      const date = new Date(d.timestamp);
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    });

    const ecoIndices = sortedData.map(d => calcEcoIndices(d));

    const series = [
      { name: 'Shannon指数', data: ecoIndices.map(e => e.shannonIndex) },
      { name: 'Simpson指数', data: ecoIndices.map(e => e.simpsonIndex) },
      { name: 'Pielou均匀度', data: ecoIndices.map(e => e.evennessIndex) },
      { name: 'Margalef指数', data: ecoIndices.map(e => e.margalefIndex) },
    ];

    return { xData, series };
  };

  const waterQualityChartData = processWaterQualityData();
  const planktonChartData = processPlanktonData();
  const ecoIndexChartData = processEcoIndexData();

  const handleFilterChange = (filters: { dateRange?: [string, string]; stationIds?: string[] }) => {
    if (filters.dateRange) setDateRange(filters.dateRange);
    if (filters.stationIds) setStationIds(filters.stationIds);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <PageContainer 
      title="时序趋势分析" 
      subtitle="分析水质、营养盐、浮游生物及生态指标的时间变化趋势"
    >
      <div className="space-y-6">
        <FilterBar 
          stations={stations} 
          onFilterChange={handleFilterChange}
        />

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">多指标趋势分析</h3>
            <div className="flex flex-wrap gap-2">
              {indicatorConfig.map(config => (
                <button
                  key={config.key}
                  onClick={() => toggleIndicator(config.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    visibleIndicators.includes(config.key)
                      ? 'text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                  style={visibleIndicators.includes(config.key) ? { backgroundColor: config.color } : {}}
                >
                  {config.name}
                </button>
              ))}
            </div>
          </div>
          <LineChart
            xData={waterQualityChartData.xData}
            series={waterQualityChartData.series}
            height={350}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">浮游生物密度趋势</h3>
            <LineChart
              xData={planktonChartData.xData}
              series={planktonChartData.series}
              height={300}
            />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">生态指标趋势</h3>
            <LineChart
              xData={ecoIndexChartData.xData}
              series={ecoIndexChartData.series}
              height={300}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">原始数据</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">监测时间</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">监测站点</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">水温(°C)</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">pH</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">溶解氧(mg/L)</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">总氮(mg/L)</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">总磷(mg/L)</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Shannon</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Simpson</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-500">加载中...</td>
                  </tr>
                ) : !fusedData?.data.length ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-500">暂无数据</td>
                  </tr>
                ) : (
                  fusedData.data.map((item, idx) => {
                    const ecoIndex = calcEcoIndices(item);
                    return (
                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="py-3 px-4 text-gray-900 dark:text-white">{formatDate(item.timestamp)}</td>
                        <td className="py-3 px-4 text-gray-900 dark:text-white">{item.stationName}</td>
                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{item.waterQuality.temperature.toFixed(1)}</td>
                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{item.waterQuality.ph.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{item.waterQuality.dissolvedOxygen.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{item.nutrient.totalNitrogen.toFixed(3)}</td>
                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{item.nutrient.totalPhosphorus.toFixed(3)}</td>
                        <td className="py-3 px-4 text-right text-[#2dd4bf] font-medium">{ecoIndex.shannonIndex.toFixed(3)}</td>
                        <td className="py-3 px-4 text-right text-[#60a5fa] font-medium">{ecoIndex.simpsonIndex.toFixed(3)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {fusedData && (
            <div className="mt-4">
              <Pagination
                page={page}
                totalPages={fusedData.totalPages}
                total={fusedData.total}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default TrendAnalysis;
