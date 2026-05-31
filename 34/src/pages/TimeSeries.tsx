import { useEffect, useState, useRef, useCallback } from 'react';
import { apiService } from '@/services/api';
import { useAppStore } from '@/store/appStore';
import TrendChart from '@/components/TrendChart';
import PredictionChart from '@/components/PredictionChart';
import StatCard from '@/components/StatCard';
import type { TimeSeriesFeature, StationFlow, PredictionResult } from '@/types';
import { Activity, TrendingUp, AlertTriangle, Clock, BarChart3 } from 'lucide-react';

export default function TimeSeries() {
  const { stations, setStations } = useAppStore();
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [features, setFeatures] = useState<TimeSeriesFeature | null>(null);
  const [trendData, setTrendData] = useState<{ timestamp: string; inflow: number; outflow: number; totalFlow: number }[]>([]);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPrediction, setShowPrediction] = useState(true);
  const isMountedRef = useRef(true);
  const lastLoadTimeRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    loadStations();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (selectedStation) {
      loadStationData(selectedStation);
    }
  }, [selectedStation]);

  const loadStations = async () => {
    try {
      const res = await apiService.getStations();
      if (res.success && isMountedRef.current) {
        setStations(res.data);
        if (res.data.length > 0) {
          setSelectedStation(res.data[0].stationId);
        }
      }
    } catch (error) {
      console.error('Failed to load stations:', error);
    }
  };

  const loadStationData = useCallback(async (stationId: string) => {
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 5000) return;

    setLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const [featuresRes, flowRes, predictionRes] = await Promise.all([
        apiService.getTimeSeriesFeatures(stationId),
        apiService.getStationFlow(stationId, 12),
        apiService.getPrediction(stationId, 6),
      ]);

      clearTimeout(timeoutId);

      if (isMountedRef.current) {
        if (featuresRes.success) {
          setFeatures(featuresRes.data);
        }
        if (flowRes.success) {
          const data = Object.entries(flowRes.data).map(([timestamp, flow]: [string, any]) => ({
            timestamp,
            inflow: flow.inflow,
            outflow: flow.outflow,
            totalFlow: flow.totalFlow,
          }));
          data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          setTrendData(data);
        }
        if (predictionRes.success) {
          setPrediction(predictionRes.data);
        }
        lastLoadTimeRef.current = Date.now();
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        console.error('Failed to load station data:', err);
        if (err.name === 'AbortError') {
          setError('数据加载超时，使用缓存数据');
        } else {
          setError('数据加载失败，请重试');
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleRefresh = async () => {
    if (isRefreshing || !selectedStation) return;
    setIsRefreshing(true);
    lastLoadTimeRef.current = 0;
    await loadStationData(selectedStation);
    setIsRefreshing(false);
  };

  const currentStation = stations.find(s => s.stationId === selectedStation);

  return (
    <div className="pt-20 px-6 pb-8">
      <div className="max-w-screen-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">时序特征分析</h2>
            <p className="text-slate-400">分析站点客流的时间序列特征，包括趋势、周期性和异常检测</p>
          </div>
          <div className="flex items-center gap-4">
            {error && (
              <span className="text-sm text-orange-400">{error}</span>
            )}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
              className="px-4 py-2 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-600/30 transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isRefreshing ? (
                <>
                  <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                  刷新中
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" />
                  刷新数据
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-1">
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">选择站点</h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {stations.map((station) => (
                  <button
                    key={station.stationId}
                    onClick={() => setSelectedStation(station.stationId)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                      selectedStation === station.stationId
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-medium">{station.stationName}</div>
                    <div className="text-xs opacity-70">{station.lineName}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-3 space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                title="平均客流"
                value={features?.avgFlow?.toLocaleString() || '-'}
                icon={<Activity className="w-6 h-6" />}
                color="cyan"
              />
              <StatCard
                title="峰值客流"
                value={features?.maxFlow?.toLocaleString() || '-'}
                icon={<TrendingUp className="w-6 h-6" />}
                color="green"
              />
              <StatCard
                title="最低客流"
                value={features?.minFlow?.toLocaleString() || '-'}
                icon={<Activity className="w-6 h-6" />}
                color="blue"
              />
              <StatCard
                title="异常次数"
                value={features?.anomalies?.length || 0}
                icon={<AlertTriangle className="w-6 h-6" />}
                color={features && features.anomalies.length > 0 ? 'red' : 'orange'}
              />
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {currentStation?.stationName || '站点'} - 客流趋势
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPrediction(false)}
                    className={`px-3 py-1 rounded text-xs transition-colors ${
                      !showPrediction ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    历史趋势
                  </button>
                  <button
                    onClick={() => setShowPrediction(true)}
                    className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                      showPrediction ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <BarChart3 className="w-3 h-3" />
                    趋势预测
                  </button>
                </div>
              </div>
              {loading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-slate-400 text-sm">加载中...</p>
                  </div>
                </div>
              ) : showPrediction && prediction ? (
                <PredictionChart
                  prediction={prediction}
                  historicalData={trendData.map(d => ({ timestamp: d.timestamp, totalFlow: d.totalFlow }))}
                  height={300}
                />
              ) : trendData.length > 0 ? (
                <TrendChart data={trendData} height={300} />
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-slate-500">暂无数据</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
                <h3 className="text-lg font-semibold text-white mb-4">高峰时段</h3>
                <div className="space-y-3">
                  {features?.peakHours?.map((hour, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-300">高峰时段 {index + 1}</span>
                      <span className="text-cyan-400 font-bold">{hour}:00 - {hour + 1}:00</span>
                    </div>
                  ))}
                  {!features?.peakHours?.length && (
                    <p className="text-slate-500 text-center py-4">暂无高峰时段数据</p>
                  )}
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
                <h3 className="text-lg font-semibold text-white mb-4">异常检测</h3>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {features?.anomalies?.map((anomaly, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded-lg text-sm ${
                        anomaly.type === 'spike'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-orange-500/10 text-orange-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{anomaly.type === 'spike' ? '客流突增' : '客流下降'}</span>
                        <span>{anomaly.value.toLocaleString()}</span>
                      </div>
                      <div className="text-xs opacity-70">
                        {new Date(anomaly.timestamp).toLocaleTimeString('zh-CN')}
                      </div>
                    </div>
                  ))}
                  {!features?.anomalies?.length && (
                    <p className="text-slate-500 text-center py-4">暂无异常数据</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
