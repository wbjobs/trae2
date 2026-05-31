import { useEffect, useState, useRef, useCallback } from 'react';
import { apiService } from '@/services/api';
import { useAppStore } from '@/store/appStore';
import StationMap from '@/components/StationMap';
import type { HeatmapData, StationInfo } from '@/types';
import { Flame, Thermometer, Loader2 } from 'lucide-react';

export default function Heatmap() {
  const { stations, setStations } = useAppStore();
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [selectedStation, setSelectedStation] = useState<StationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMountedRef = useRef(true);
  const lastLoadTimeRef = useRef(0);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    loadInitialData();

    const interval = setInterval(() => {
      if (isMountedRef.current) {
        refreshHeatmapData();
      }
    }, 10000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }

      loadTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && loading) {
          setError('加载超时，正在重试...');
        }
      }, 15000);

      const [stationsRes, heatmapRes] = await Promise.all([
        apiService.getStations(),
        apiService.getHeatmapData(),
      ]);

      if (isMountedRef.current) {
        if (stationsRes.success) setStations(stationsRes.data);
        if (heatmapRes.success) setHeatmapData(heatmapRes.data);
        setLoading(false);
        setError(null);
        lastLoadTimeRef.current = Date.now();
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('Failed to load heatmap data:', err);
        setError('数据加载失败，点击重试');
        setLoading(false);
      }
    } finally {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    }
  };

  const refreshHeatmapData = useCallback(async () => {
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 8000) return;

    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      const heatmapRes = await apiService.getHeatmapData();
      if (isMountedRef.current && heatmapRes.success) {
        setHeatmapData(heatmapRes.data);
        lastLoadTimeRef.current = Date.now();
      }
    } catch (err) {
      console.error('Failed to refresh heatmap:', err);
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [isRefreshing]);

  const getIntensityColor = (intensity: number) => {
    if (intensity >= 80) return { bg: 'bg-red-500', text: 'text-red-400', label: '极高' };
    if (intensity >= 60) return { bg: 'bg-orange-500', text: 'text-orange-400', label: '高' };
    if (intensity >= 40) return { bg: 'bg-yellow-500', text: 'text-yellow-400', label: '中' };
    if (intensity >= 20) return { bg: 'bg-green-500', text: 'text-green-400', label: '低' };
    return { bg: 'bg-blue-500', text: 'text-blue-400', label: '极低' };
  };

  const sortedHeatmapData = [...heatmapData].sort((a, b) => b.intensity - a.intensity);

  if (loading && stations.length === 0) {
    return (
      <div className="pt-20 px-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">加载热力图数据中...</p>
          {error && (
            <button
              onClick={loadInitialData}
              className="mt-4 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 transition-colors"
            >
              重试
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 px-6 pb-8">
      <div className="max-w-screen-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">客流热力图</h2>
            <p className="text-slate-400">实时展示各站点客流密度分布，颜色越深表示客流越大</p>
          </div>
          <div className="flex items-center gap-4">
            {error && (
              <button
                onClick={loadInitialData}
                className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition-colors text-sm"
              >
                重新加载
              </button>
            )}
            <div className="flex items-center gap-2">
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              )}
              <span className="text-xs text-green-400">
                {isRefreshing ? '更新中...' : '实时更新'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-3">
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-400" />
                  站点客流热力分布图
                </h3>
              </div>
              <div className="relative">
                <StationMap
                  stations={stations}
                  heatmapData={heatmapData}
                  showHeatmap={true}
                  selectedStation={selectedStation?.stationId}
                  onStationClick={setSelectedStation}
                />
                {isRefreshing && (
                  <div className="absolute top-2 right-2 bg-slate-900/80 px-3 py-1 rounded-lg text-xs text-slate-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    刷新中
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-1 space-y-6">
            {selectedStation && (
              <div className="bg-slate-900/50 rounded-xl border border-cyan-500/30 p-4">
                <h3 className="text-lg font-semibold text-white mb-4">选中站点</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">站点名称</span>
                    <span className="text-white font-medium">{selectedStation.stationName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">所属线路</span>
                    <span className="text-cyan-400">{selectedStation.lineName}</span>
                  </div>
                  {heatmapData.find(h => h.stationId === selectedStation.stationId) && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">当前客流</span>
                        <span className="text-white font-bold">
                          {heatmapData.find(h => h.stationId === selectedStation.stationId)?.flowCount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">客流强度</span>
                        <span className={`font-bold ${getIntensityColor(heatmapData.find(h => h.stationId === selectedStation.stationId)?.intensity || 0).text}`}>
                          {getIntensityColor(heatmapData.find(h => h.stationId === selectedStation.stationId)?.intensity || 0).label}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setSelectedStation(null)}
                  className="mt-4 w-full py-2 bg-slate-800 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                >
                  取消选择
                </button>
              </div>
            )}

            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-orange-400" />
                客流强度图例
              </h3>
              <div className="space-y-2">
                {[
                  { label: '极高', color: 'bg-red-500', range: '80-100%' },
                  { label: '高', color: 'bg-orange-500', range: '60-80%' },
                  { label: '中', color: 'bg-yellow-500', range: '40-60%' },
                  { label: '低', color: 'bg-green-500', range: '20-40%' },
                  { label: '极低', color: 'bg-blue-500', range: '0-20%' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded ${item.color}`}></div>
                    <span className="text-sm text-slate-300 w-12">{item.label}</span>
                    <span className="text-xs text-slate-500">{item.range}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4">客流排名 TOP 10</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {sortedHeatmapData.slice(0, 10).map((item, index) => (
                  <div
                    key={item.stationId}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedStation(stations.find(s => s.stationId === item.stationId) || null)}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      index < 3 ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{item.stationName}</div>
                      <div className="text-xs text-slate-500">{item.flowCount.toLocaleString()} 人次</div>
                    </div>
                    <div className={`w-2 h-8 rounded-full flex-shrink-0 ${getIntensityColor(item.intensity).bg}`}></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
