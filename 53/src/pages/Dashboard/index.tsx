import React, { useEffect, useState } from 'react';
import {
  Activity,
  MapPin,
  FileCheck,
  TrendingUp,
  AlertTriangle,
  Droplets,
} from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import QualityTag from '../../components/common/QualityTag';
import LineChart from '../../components/charts/LineChart';
import PieChart from '../../components/charts/PieChart';
import BarChart from '../../components/charts/BarChart';
import GaugeChart from '../../components/charts/GaugeChart';
import type {
  DashboardStats,
  SectionRealtimeData,
  TrendDataPoint,
} from '../../types';
import {
  getDashboardStats,
  getRealtimeData,
  getTrendData,
} from '../../api';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [realtimeData, setRealtimeData] = useState<SectionRealtimeData[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, realtime, trend] = await Promise.all([
          getDashboardStats(),
          getRealtimeData(),
          getTrendData('do', undefined, 30),
        ]);
        setStats(statsData);
        setRealtimeData(realtime);
        setTrendData(trend);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  const qualityDistribution = [
    { name: '优', value: 62.5, color: '#10b981' },
    { name: '良', value: 25.3, color: '#0ea5e9' },
    { name: '轻度污染', value: 9.2, color: '#f59e0b' },
    { name: '重度污染', value: 3.0, color: '#ef4444' },
  ];

  const sectionWQIData = realtimeData.slice(0, 5).map((item) => ({
    name: item.section.name,
    value: item.wqi,
    color: item.overallQuality === 'excellent'
      ? '#10b981'
      : item.overallQuality === 'good'
      ? '#0ea5e9'
      : item.overallQuality === 'moderate'
      ? '#f59e0b'
      : '#ef4444',
  }));

  const trendChartData = trendData.map((item) => ({
    time: item.timestamp,
    value: item.value,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          title="监测断面"
          value={stats?.totalSections || 0}
          unit="个"
          icon={MapPin}
          color="blue"
        />
        <StatCard
          title="在线断面"
          value={stats?.onlineSections || 0}
          unit="个"
          trend={5.2}
          trendLabel="较昨日"
          icon={Activity}
          color="green"
        />
        <StatCard
          title="今日采样"
          value={stats?.todaySamples || 0}
          unit="次"
          trend={12.8}
          trendLabel="较昨日"
          icon={FileCheck}
          color="purple"
        />
        <StatCard
          title="优良率"
          value={stats?.excellentRate || 0}
          unit="%"
          trend={stats?.trend.excellentRate || 0}
          trendLabel="较上周"
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="平均WQI"
          value={stats?.avgWQI || 0}
          icon={Droplets}
          color="blue"
        />
        <StatCard
          title="异常告警"
          value={stats?.alertCount || 0}
          unit="条"
          icon={AlertTriangle}
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-4">水质指数趋势</h3>
          <GaugeChart
            value={stats?.avgWQI || 78.5}
            unit=""
            min={0}
            max={100}
            height={180}
          />
          <div className="flex justify-center gap-4 mt-2 text-xs text-gray-500">
            <span>0-50 差</span>
            <span>50-70 中</span>
            <span>70-90 良</span>
            <span>90-100 优</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-4">水质等级分布</h3>
          <PieChart
            data={qualityDistribution}
            height={220}
            innerRadius={50}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-4">断面WQI排名</h3>
          <BarChart
            data={sectionWQIData}
            height={220}
            horizontal
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-800 mb-4">溶解氧趋势</h3>
        <LineChart
          data={trendChartData}
          yAxisName="溶解氧(mg/L)"
          unit="mg/L"
          areaStyle
          height={300}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-800 mb-4">实时监测数据</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 font-medium text-gray-600">监测断面</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">所属河流</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">水质等级</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">WQI</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">溶解氧</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">PH值</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">氨氮</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {realtimeData.slice(0, 6).map((item) => {
                const doFactor = item.factors.find((f) => f.factor.id === 'do');
                const phFactor = item.factors.find((f) => f.factor.id === 'ph');
                const nh3nFactor = item.factors.find((f) => f.factor.id === 'nh3n');
                return (
                  <tr key={item.section.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-800">
                      {item.section.name}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{item.section.riverName}</td>
                    <td className="py-3 px-4">
                      <QualityTag quality={item.overallQuality} size="sm" />
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-800">{item.wqi}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {doFactor?.value.toFixed(2)} mg/L
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {phFactor?.value.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {nh3nFactor?.value.toFixed(3)} mg/L
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {doFactor?.updateTime}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
