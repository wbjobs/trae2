import { useEffect, useState } from 'react';
import { apiService } from '@/services/api';
import { useAppStore } from '@/store/appStore';
import StatCard from '@/components/StatCard';
import StationMap from '@/components/StationMap';
import TrendChart from '@/components/TrendChart';
import AlertPanel from '@/components/AlertPanel';
import StationStatsPanel from '@/components/StationStatsPanel';
import DynamicRanking from '@/components/DynamicRanking';
import type { RankingResult } from '@/types';
import { Train, Users, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';

export default function Dashboard() {
  const {
    overviewStats,
    stations,
    realtimeFlow,
    alerts,
    stationStats,
    setOverviewStats,
    setStations,
    setRealtimeFlow,
    setAlerts,
    setStationStats,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState<RankingResult | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [overviewRes, stationsRes, flowRes, alertsRes, statsRes, rankingsRes] = await Promise.all([
        apiService.getOverviewStats(),
        apiService.getStations(),
        apiService.getRealTimeFlow(),
        apiService.getAlerts(10),
        apiService.getStationStats(),
        apiService.getRankings(),
      ]);

      if (overviewRes.success) setOverviewStats(overviewRes.data);
      if (stationsRes.success) setStations(stationsRes.data);
      if (flowRes.success) setRealtimeFlow(flowRes.data);
      if (alertsRes.success) setAlerts(alertsRes.data);
      if (statsRes.success) setStationStats(statsRes.data);
      if (rankingsRes.success) setRankings(rankingsRes.data);

      setLoading(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoading(false);
    }
  };

  const getTrendData = () => {
    const data: { timestamp: string; inflow: number; outflow: number; totalFlow: number }[] = [];
    const sortedStations = [...stationStats].sort((a, b) => b.totalFlowToday - a.totalFlowToday).slice(0, 5);

    sortedStations.forEach((stat) => {
      data.push({
        timestamp: stat.peakTime,
        inflow: Math.round(stat.avgFlowPerHour * 0.5),
        outflow: Math.round(stat.avgFlowPerHour * 0.5),
        totalFlow: stat.avgFlowPerHour,
      });
    });

    return data.length > 0 ? data : [
      { timestamp: '08:00', inflow: 800, outflow: 200, totalFlow: 1000 },
      { timestamp: '12:00', inflow: 500, outflow: 500, totalFlow: 1000 },
      { timestamp: '18:00', inflow: 200, outflow: 800, totalFlow: 1000 },
    ];
  };

  if (loading) {
    return (
      <div className="pt-20 px-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">加载数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 px-6 pb-8">
      <div className="max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            title="全线站点数"
            value={overviewStats?.totalStations || 30}
            icon={<Train className="w-8 h-8" />}
            color="cyan"
          />
          <StatCard
            title="今日总客流"
            value={(overviewStats?.totalFlowToday || 0).toLocaleString()}
            icon={<Users className="w-8 h-8" />}
            color="blue"
          />
          <StatCard
            title="实时客流"
            value={(overviewStats?.currentTotalFlow || 0).toLocaleString()}
            icon={<TrendingUp className="w-8 h-8" />}
            color="green"
            trend={{ value: 12.5, isPositive: true }}
          />
          <StatCard
            title="活跃预警"
            value={alerts.length}
            icon={<AlertTriangle className="w-8 h-8" />}
            color={alerts.length > 0 ? 'red' : 'green'}
          />
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">全线站点分布图</h3>
              <StationMap stations={stations} />
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4">客流趋势分析</h3>
              <TrendChart data={getTrendData()} height={280} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4">实时预警</h3>
              <AlertPanel alerts={alerts} maxItems={5} />
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                站点客流排名
              </h3>
              <DynamicRanking data={rankings} limit={8} />
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4">热门站点</h3>
              <StationStatsPanel stats={stationStats} limit={5} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
