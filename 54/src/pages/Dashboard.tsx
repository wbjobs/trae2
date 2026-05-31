import { useEffect, useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { apiService } from '../services/api';
import Header from '../components/dashboard/Header';
import RealtimeCards from '../components/dashboard/RealtimeCards';
import HeatmapPanel from '../components/dashboard/HeatmapPanel';
import TimeseriesChart from '../components/dashboard/TimeseriesChart';
import AnomalyPanel from '../components/dashboard/AnomalyPanel';
import RiskPanel from '../components/dashboard/RiskPanel';
import DeviceStatusPanel from '../components/dashboard/DeviceStatusPanel';
import PredictionPanel from '../components/dashboard/PredictionPanel';
import ZoneRanking from '../components/dashboard/ZoneRanking';
import { BarChart3, Activity, MapPin } from 'lucide-react';

type ViewMode = 'main' | 'prediction' | 'ranking';

const Dashboard = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const {
    setRealtimeData,
    setFeatures,
    setAnomalies,
    setRiskStats,
    setDevices,
    setTimeseries,
    setHeatmapData,
    setPrediction,
    setZones,
    setZoneRankings,
    heatmapType,
    prediction,
    zones,
    zoneRankings,
  } = useDashboardStore();

  const fetchData = async () => {
    try {
      const [
        realtimeRes,
        featuresRes,
        anomaliesRes,
        riskRes,
        devicesRes,
        timeseriesRes,
        heatmapRes,
      ] = await Promise.all([
        apiService.getRealtimeData(),
        apiService.getFeatures(),
        apiService.getAnomalies(),
        apiService.getRisk(),
        apiService.getDevices(),
        apiService.getTimeseries(24, 300),
        apiService.getHeatmap(heatmapType),
      ]);

      setRealtimeData(realtimeRes.latestData);
      setFeatures(featuresRes);
      setAnomalies(anomaliesRes.clusters);
      setRiskStats(riskRes);
      setDevices(devicesRes);
      setTimeseries(timeseriesRes);
      setHeatmapData(heatmapRes);
    } catch (error) {
      console.error('数据加载失败:', error);
    }
  };

  const fetchPrediction = async () => {
    try {
      const predictionRes = await apiService.getPrediction();
      setPrediction(predictionRes);
    } catch (error) {
      console.error('预测数据加载失败:', error);
    }
  };

  const fetchZones = async () => {
    try {
      const [zonesRes, rankingsRes] = await Promise.all([
        apiService.getZones(),
        apiService.getZoneRankings(),
      ]);
      setZones(zonesRes);
      setZoneRankings(rankingsRes);
    } catch (error) {
      console.error('分区数据加载失败:', error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchPrediction();
    fetchZones();

    const dataInterval = setInterval(fetchData, 5000);
    const predictionInterval = setInterval(fetchPrediction, 15000);
    const zonesInterval = setInterval(fetchZones, 45000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(predictionInterval);
      clearInterval(zonesInterval);
    };
  }, [heatmapType]);

  return (
    <div className="min-h-screen bg-[#0a1628] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00d4ff]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#ff6b35]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative h-screen flex flex-col">
        <Header />

        <div className="flex-1 p-4 overflow-hidden flex flex-col gap-4">
          <RealtimeCards />

          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setViewMode('main')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'main'
                  ? 'bg-[#00d4ff] text-[#0a1628]'
                  : 'bg-white/5 text-[#8aa4c4] hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                主监控视图
              </div>
            </button>
            <button
              onClick={() => setViewMode('prediction')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'prediction'
                  ? 'bg-[#00d4ff] text-[#0a1628]'
                  : 'bg-white/5 text-[#8aa4c4] hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                态势预测
              </div>
            </button>
            <button
              onClick={() => setViewMode('ranking')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'ranking'
                  ? 'bg-[#00d4ff] text-[#0a1628]'
                  : 'bg-white/5 text-[#8aa4c4] hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                分区排名
              </div>
            </button>
          </div>

          {viewMode === 'main' && (
            <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
              <div className="col-span-8 flex flex-col gap-4 min-h-0">
                <div className="flex-1 min-h-0">
                  <HeatmapPanel />
                </div>
                <div className="h-64">
                  <TimeseriesChart />
                </div>
              </div>

              <div className="col-span-4 flex flex-col gap-4 min-h-0">
                <div className="flex-1 min-h-0">
                  <AnomalyPanel />
                </div>
                <div className="flex-1 min-h-0">
                  <RiskPanel />
                </div>
              </div>
            </div>
          )}

          {viewMode === 'prediction' && (
            <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
              <div className="col-span-8 flex flex-col gap-4 min-h-0">
                <div className="flex-1 min-h-0">
                  <PredictionPanel data={prediction} />
                </div>
                <div className="h-64">
                  <TimeseriesChart />
                </div>
              </div>
              <div className="col-span-4 flex flex-col gap-4 min-h-0">
                <div className="flex-1 min-h-0">
                  <AnomalyPanel />
                </div>
                <div className="flex-1 min-h-0">
                  <RiskPanel />
                </div>
              </div>
            </div>
          )}

          {viewMode === 'ranking' && (
            <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
              <div className="col-span-8 min-h-0">
                <ZoneRanking zones={zones} rankings={zoneRankings} />
              </div>
              <div className="col-span-4 flex flex-col gap-4 min-h-0">
                <div className="flex-1 min-h-0">
                  <RiskPanel />
                </div>
                <div className="flex-1 min-h-0">
                  <PredictionPanel data={prediction} />
                </div>
              </div>
            </div>
          )}

          <div className="h-48">
            <DeviceStatusPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
