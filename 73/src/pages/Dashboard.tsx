import React, { useEffect } from 'react';
import { Thermometer, Droplets, Wind, FlaskConical, Atom, Radio } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useFilterStore } from '@/store/useFilterStore';
import { DataCard, StatusBadge, LoadingSpinner } from '@/components/common';
import { PieChart, RadarChart } from '@/components/charts';
import { formatNumber, formatDateTime } from '@/utils/format';
import type { EcoIndexResult } from '@/types';
import { calcEcoIndices } from '@/services/ecoIndex';

const Dashboard: React.FC = () => {
  const { stations, dashboardStats, loading, error, fetchStations, fetchDashboardStats, fusedData } =
    useDataStore();
  const { getPaginationParams } = useFilterStore();

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchDashboardStats(), fetchStations()]);
    };
    loadData();
  }, [fetchDashboardStats, fetchStations]);

  if (loading && !dashboardStats) {
    return <LoadingSpinner fullscreen text="加载中..." />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">{error}</p>
          <button
            onClick={() => {
              fetchDashboardStats();
              fetchStations();
            }}
            className="px-6 py-2 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2dd4bf] transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const cardConfigs = [
    {
      title: '平均水温',
      value: dashboardStats?.avgTemperature ?? 0,
      unit: '°C',
      icon: <Thermometer className="w-5 h-5" />,
      color: '#60a5fa',
    },
    {
      title: '平均pH',
      value: dashboardStats?.avgPh ?? 0,
      unit: '',
      icon: <FlaskConical className="w-5 h-5" />,
      color: '#2dd4bf',
    },
    {
      title: '平均溶解氧',
      value: dashboardStats?.avgDissolvedOxygen ?? 0,
      unit: 'mg/L',
      icon: <Wind className="w-5 h-5" />,
      color: '#10b981',
    },
    {
      title: '平均总氮',
      value: dashboardStats?.avgTotalNitrogen ?? 0,
      unit: 'mg/L',
      icon: <Atom className="w-5 h-5" />,
      color: '#f59e0b',
    },
    {
      title: '平均总磷',
      value: dashboardStats?.avgTotalPhosphorus ?? 0,
      unit: 'mg/L',
      icon: <Droplets className="w-5 h-5" />,
      color: '#ef4444',
    },
    {
      title: '在线站点数',
      value: dashboardStats?.onlineStations ?? 0,
      unit: `/${dashboardStats?.stationCount ?? 0}`,
      icon: <Radio className="w-5 h-5" />,
      color: '#1e3a5f',
    },
  ];

  const pieData = [
    {
      name: '浮游植物',
      value: dashboardStats?.totalPhytoplanktonDensity ?? 0,
    },
    {
      name: '浮游动物',
      value: dashboardStats?.totalZooplanktonDensity ?? 0,
    },
  ];

  const radarIndicators = [
    { name: 'Shannon指数', max: 5 },
    { name: 'Simpson指数', max: 1 },
    { name: '均匀度指数', max: 1 },
    { name: 'Margalef指数', max: 10 },
    { name: '营养状态指数', max: 100 },
  ];

  const ecoResults: EcoIndexResult[] = fusedData?.data
    ? fusedData.data.slice(0, 6).map((d) => calcEcoIndices(d))
    : [];

  const radarData = stations.slice(0, 6).map((station, idx) => {
    const eco = ecoResults[idx];
    return {
      name: station.name,
      value: [
        eco?.shannonIndex ?? 0,
        eco?.simpsonIndex ?? 0,
        eco?.evennessIndex ?? 0,
        eco?.margalefIndex ?? 0,
        eco?.trophicLevelIndex ?? 0,
      ],
    };
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">数据概览</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          实时监测数据与生态环境指标概览
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cardConfigs.map((card, idx) => (
          <DataCard
            key={idx}
            title={card.title}
            value={formatNumber(card.value)}
            unit={card.unit}
            icon={card.icon}
            color={card.color}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">站点状态列表</h2>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {stations.map((station) => (
              <div
                key={station.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: '#1e3a5f15' }}
                  >
                    <Radio className="w-5 h-5" style={{ color: '#1e3a5f' }} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{station.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{station.lakeArea}</p>
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={station.status} />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {formatDateTime(station.lastUpdate)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <PieChart data={pieData} title="浮游生物密度概览" height={400} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <RadarChart
          indicators={radarIndicators}
          data={radarData}
          title="营养状态指数雷达图"
          height={500}
        />
      </div>
    </div>
  );
};

export default Dashboard;
