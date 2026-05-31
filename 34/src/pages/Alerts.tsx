import { useEffect, useState } from 'react';
import { apiService } from '@/services/api';
import AlertPanel from '@/components/AlertPanel';
import PeakHourChart from '@/components/PeakHourChart';
import type { AlertRecord, AlertThreshold, PeakHourStat, StationStats } from '@/types';
import { AlertTriangle, Settings, Bell, TrendingUp } from 'lucide-react';

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [thresholds, setThresholds] = useState<AlertThreshold | null>(null);
  const [peakHourStats, setPeakHourStats] = useState<PeakHourStat[]>([]);
  const [stationStats, setStationStats] = useState<StationStats[]>([]);
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [editingThresholds, setEditingThresholds] = useState(false);
  const [tempThresholds, setTempThresholds] = useState<AlertThreshold | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [alertsRes, thresholdsRes, peakHoursRes, statsRes, countRes] = await Promise.all([
        apiService.getAlerts(50),
        apiService.getAlertThresholds(),
        apiService.getPeakHourStats(),
        apiService.getStationStats(),
        apiService.getActiveAlertCount(),
      ]);

      if (alertsRes.success) setAlerts(alertsRes.data);
      if (thresholdsRes.success) setThresholds(thresholdsRes.data);
      if (peakHoursRes.success) setPeakHourStats(peakHoursRes.data);
      if (statsRes.success) setStationStats(statsRes.data);
      if (countRes.success) setActiveAlertCount(countRes.data.activeAlertCount);

      setLoading(false);
    } catch (error) {
      console.error('Failed to load alerts data:', error);
      setLoading(false);
    }
  };

  const handleSaveThresholds = async () => {
    if (!tempThresholds) return;
    try {
      const res = await apiService.updateAlertThresholds(tempThresholds);
      if (res.success) {
        setThresholds(res.data);
        setEditingThresholds(false);
        setTempThresholds(null);
      }
    } catch (error) {
      console.error('Failed to update thresholds:', error);
    }
  };

  const getDangerAlerts = () => alerts.filter(a => a.alertLevel === 'danger');
  const getWarningAlerts = () => alerts.filter(a => a.alertLevel === 'warning');

  const getPeakHourChartData = () => {
    const hourData: Record<number, number[]> = {};
    peakHourStats.forEach(stat => {
      if (!hourData[stat.hour]) {
        hourData[stat.hour] = [];
      }
      hourData[stat.hour].push(stat.avgFlow);
    });

    return Object.entries(hourData)
      .map(([hour, flows]) => ({
        hour: parseInt(hour),
        avgFlow: Math.round(flows.reduce((a, b) => a + b, 0) / flows.length),
        isPeak: true,
      }))
      .sort((a, b) => a.hour - b.hour);
  };

  const highAlertStations = stationStats.filter(s => s.alertCount > 0).sort((a, b) => b.alertCount - a.alertCount);

  if (loading) {
    return (
      <div className="pt-20 px-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">加载预警数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 px-6 pb-8">
      <div className="max-w-screen-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">预警统计</h2>
            <p className="text-slate-400">实时监控客流异常，管理预警阈值和统计</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-red-500/20 px-4 py-2 rounded-lg border border-red-500/30">
              <p className="text-xs text-red-400">活跃预警</p>
              <p className="text-2xl font-bold text-red-400">{activeAlertCount}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-1 space-y-6">
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  预警阈值
                </h3>
                {!editingThresholds ? (
                  <button
                    onClick={() => {
                      setTempThresholds(thresholds);
                      setEditingThresholds(true);
                    }}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    编辑
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveThresholds}
                      className="text-xs text-green-400 hover:text-green-300"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => {
                        setEditingThresholds(false);
                        setTempThresholds(null);
                      }}
                      className="text-xs text-slate-400 hover:text-slate-300"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>

              {thresholds && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">预警阈值 (人次)</label>
                    {editingThresholds ? (
                      <input
                        type="number"
                        value={tempThresholds?.warning || 0}
                        onChange={(e) => setTempThresholds({ ...tempThresholds!, warning: parseInt(e.target.value) })}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                      />
                    ) : (
                      <p className="text-lg font-bold text-orange-400">{thresholds.warning.toLocaleString()}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">危险阈值 (人次)</label>
                    {editingThresholds ? (
                      <input
                        type="number"
                        value={tempThresholds?.danger || 0}
                        onChange={(e) => setTempThresholds({ ...tempThresholds!, danger: parseInt(e.target.value) })}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                      />
                    ) : (
                      <p className="text-lg font-bold text-red-400">{thresholds.danger.toLocaleString()}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">突增比率</label>
                    {editingThresholds ? (
                      <input
                        type="number"
                        step="0.1"
                        value={tempThresholds?.suddenIncreaseRate || 0}
                        onChange={(e) => setTempThresholds({ ...tempThresholds!, suddenIncreaseRate: parseFloat(e.target.value) })}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                      />
                    ) : (
                      <p className="text-lg font-bold text-yellow-400">{thresholds.suddenIncreaseRate}x</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">下降比率</label>
                    {editingThresholds ? (
                      <input
                        type="number"
                        step="0.1"
                        value={tempThresholds?.abnormalDropRate || 0}
                        onChange={(e) => setTempThresholds({ ...tempThresholds!, abnormalDropRate: parseFloat(e.target.value) })}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                      />
                    ) : (
                      <p className="text-lg font-bold text-blue-400">{thresholds.abnormalDropRate}x</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5" />
                预警统计
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-red-500/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-400">{getDangerAlerts().length}</p>
                  <p className="text-xs text-slate-400">危险预警</p>
                </div>
                <div className="bg-orange-500/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-400">{getWarningAlerts().length}</p>
                  <p className="text-xs text-slate-400">警告预警</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4">高预警站点</h3>
              <div className="space-y-2">
                {highAlertStations.slice(0, 5).map((station) => (
                  <div key={station.stationId} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
                    <span className="text-sm text-slate-300">{station.stationName}</span>
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                      {station.alertCount} 次
                    </span>
                  </div>
                ))}
                {highAlertStations.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">暂无预警站点</p>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-3 space-y-6">
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                高峰时段客流分布
              </h3>
              <PeakHourChart data={getPeakHourChartData()} height={250} />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-900/50 rounded-xl border border-red-500/30 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <h3 className="text-lg font-semibold text-red-400">危险预警</h3>
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                    {getDangerAlerts().length}
                  </span>
                </div>
                <AlertPanel alerts={getDangerAlerts()} maxItems={8} />
              </div>

              <div className="bg-slate-900/50 rounded-xl border border-orange-500/30 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                  <h3 className="text-lg font-semibold text-orange-400">警告预警</h3>
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
                    {getWarningAlerts().length}
                  </span>
                </div>
                <AlertPanel alerts={getWarningAlerts()} maxItems={8} />
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-lg font-semibold text-white mb-4">全部预警记录</h3>
              <AlertPanel alerts={alerts} showAll={true} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
