import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { useFilterStore } from '@/store/useFilterStore';
import { FilterBar, LoadingSpinner } from '@/components/common';
import { BarChart, ScatterChart, LineChart, HeatmapChart } from '@/components/charts';
import { getCorrelation } from '@/services/dataFusion';
import type { FilterState } from '@/types';
import PageContainer from '@/components/layout/PageContainer';

const MultiAnalysis: React.FC = () => {
  const { stations, fusedData, loading, error, fetchFusedData, fetchStations } = useDataStore();
  const { dateRange, stationIds, setDateRange, setStationIds, setSpecies, setCategories, setIndicators, resetFilters } = useFilterStore();
  const [filters, setFilters] = useState<Partial<FilterState>>();
  const isFetchingRef = useRef(false);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  useEffect(() => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    
    const params = {
      page: 1,
      pageSize: 100,
      startTime: dateRange[0] || undefined,
      endTime: dateRange[1] || undefined,
      stationId: stationIds.length === 1 ? stationIds[0] : undefined,
    };
    
    fetchFusedData(params).finally(() => {
      isFetchingRef.current = false;
    });
  }, [dateRange[0], dateRange[1], stationIds.join(','), filters]);

  const handleFilterChange = (newFilters: any) => {
    if (newFilters.dateRange) setDateRange(newFilters.dateRange);
    if (newFilters.stationIds) setStationIds(newFilters.stationIds);
    if (newFilters.species) setSpecies(newFilters.species);
    if (newFilters.categories) setCategories(newFilters.categories);
    if (newFilters.indicators) setIndicators(newFilters.indicators);
    setFilters(newFilters);
  };

  if (loading && !fusedData) {
    return <LoadingSpinner fullscreen text="加载中..." />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">{error}</p>
          <button
            onClick={() => {
              resetFilters();
              fetchFusedData(getPaginationParams());
            }}
            className="px-6 py-2 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2dd4bf] transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const data = fusedData?.data ?? [];

  const barData = useMemo(() => {
    const speciesMap = new Map<string, number>();
    for (const item of data) {
      for (const p of item.plankton) {
        speciesMap.set(p.species, (speciesMap.get(p.species) ?? 0) + p.density);
      }
    }
    return Array.from(speciesMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [data]);

  const scatterTNData = useMemo(() => {
    const tnValues: number[] = [];
    const tpValues: number[] = [];
    const densityValues: number[] = [];

    for (const item of data) {
      const totalDensity = item.plankton.reduce((sum, p) => sum + p.density, 0);
      if (totalDensity > 0) {
        tnValues.push(item.nutrient.totalNitrogen);
        tpValues.push(item.nutrient.totalPhosphorus);
        densityValues.push(totalDensity);
      }
    }

    return { tnValues, tpValues, densityValues };
  }, [data]);

  const correlationTN = getCorrelation(scatterTNData.tnValues, scatterTNData.densityValues);
  const correlationTP = getCorrelation(scatterTNData.tpValues, scatterTNData.densityValues);

  const lineData = useMemo(() => {
    const tempMap = new Map<number, { total: number; count: number }>();
    for (const item of data) {
      const temp = Math.round(item.waterQuality.temperature);
      const totalDensity = item.plankton.reduce((sum, p) => sum + p.density, 0);
      if (!tempMap.has(temp)) {
        tempMap.set(temp, { total: 0, count: 0 });
      }
      const entry = tempMap.get(temp)!;
      entry.total += totalDensity;
      entry.count += 1;
    }
    const sortedTemps = Array.from(tempMap.entries()).sort((a, b) => a[0] - b[0]);
    return {
      xData: sortedTemps.map(([temp]) => `${temp}°C`),
      series: [{
        name: '平均浮游生物密度',
        data: sortedTemps.map(([, { total, count }]) => total / count),
      }],
    };
  }, [data]);

  const heatmapData = useMemo(() => {
    const speciesSet = new Set<string>();
    const stationSet = new Set<string>();
    const densityMatrix = new Map<string, Map<string, number>>();

    for (const item of data) {
      stationSet.add(item.stationName);
      if (!densityMatrix.has(item.stationName)) {
        densityMatrix.set(item.stationName, new Map());
      }
      const stationMap = densityMatrix.get(item.stationName)!;
      for (const p of item.plankton) {
        speciesSet.add(p.species);
        stationMap.set(p.species, (stationMap.get(p.species) ?? 0) + p.density);
      }
    }

    const xData = Array.from(speciesSet).slice(0, 10);
    const yData = Array.from(stationSet);
    const dataMatrix: number[][] = [];

    for (const station of yData) {
      const stationMap = densityMatrix.get(station) ?? new Map();
      const row: number[] = [];
      for (const species of xData) {
        row.push(stationMap.get(species) ?? 0);
      }
      dataMatrix.push(row);
    }

    return { xData, yData, data: dataMatrix };
  }, [data]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">多维数据分析</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          多维度数据关联分析与可视化展示
        </p>
      </div>

      <FilterBar stations={stations} onFilterChange={handleFilterChange} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <BarChart data={barData} title="种群密度柱状图" color="#1e3a5f" height={400} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <ScatterChart
            xData={scatterTNData.tnValues}
            yData={scatterTNData.densityValues}
            xName="总氮 (mg/L)"
            yName="浮游生物密度"
            title="总氮-浮游生物关联"
            height={400}
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <ScatterChart
            xData={scatterTNData.tpValues}
            yData={scatterTNData.densityValues}
            xName="总磷 (mg/L)"
            yName="浮游生物密度"
            title="总磷-浮游生物关联"
            height={400}
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <LineChart xData={lineData.xData} series={lineData.series} title="水温-密度折线图" height={400} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <HeatmapChart
          xData={heatmapData.xData}
          yData={heatmapData.yData}
          data={heatmapData.data}
          title="浮游生物物种分布热力图"
          height={500}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">相关性分析</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[#60a5fa]/10 rounded-xl">
              <span className="text-gray-700 dark:text-gray-300">总氮 - 浮游生物密度</span>
              <span className="text-xl font-bold" style={{ color: '#60a5fa' }}>
                {correlationTN.toFixed(4)}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-[#2dd4bf]/10 rounded-xl">
              <span className="text-gray-700 dark:text-gray-300">总磷 - 浮游生物密度</span>
              <span className="text-xl font-bold" style={{ color: '#2dd4bf' }}>
                {correlationTP.toFixed(4)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">数据统计</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[#1e3a5f]/10 rounded-xl">
              <span className="text-gray-700 dark:text-gray-300">有效数据记录数</span>
              <span className="text-xl font-bold" style={{ color: '#1e3a5f' }}>{data.length}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-[#f59e0b]/10 rounded-xl">
              <span className="text-gray-700 dark:text-gray-300">监测站点数</span>
              <span className="text-xl font-bold" style={{ color: '#f59e0b' }}>{stations.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiAnalysis;
