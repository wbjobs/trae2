import React, { useEffect } from 'react';
import { KpiCard } from '../components/KpiCard.js';
import { HeatmapLayer } from '../components/HeatmapLayer.js';
import { AlertList } from '../components/AlertList.js';
import { RiskPrediction } from '../components/RiskPrediction.js';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { Camera, Accessibility, Bell, Activity } from 'lucide-react';

const Dashboard: React.FC = () => {
  const deviceStats = useSecurityStore(state => state.deviceStats);
  const fetchDeviceStats = useSecurityStore(state => state.fetchDeviceStats);
  const updateRealtimeData = useSecurityStore(state => state.updateRealtimeData);
  const updateAlert = useSecurityStore(state => state.updateAlert);
  const updateStats = useSecurityStore(state => state.updateStats);

  useWebSocket({
    onData: (data) => {
      updateRealtimeData(data);
    },
    onAlert: (alert) => {
      updateAlert(alert);
    },
    onStats: (stats) => {
      updateStats(stats);
    }
  });

  useEffect(() => {
    fetchDeviceStats();

    const interval = setInterval(() => {
      fetchDeviceStats();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchDeviceStats]);

  if (!deviceStats) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center">
        <div className="text-slate-400 text-lg animate-pulse">数据加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="grid grid-cols-4 gap-4 mb-4">
        <KpiCard
          title="摄像头设备"
          value={deviceStats.camera?.online || 0}
          total={deviceStats.camera?.total || 0}
          trend={2.5}
          color="cyan"
          icon={<Camera size={24} />}
        />
        <KpiCard
          title="门禁设备"
          value={deviceStats.access?.online || 0}
          total={deviceStats.access?.total || 0}
          trend={1.2}
          color="green"
          icon={<Accessibility size={24} />}
        />
        <KpiCard
          title="报警设备"
          value={deviceStats.alarm?.online || 0}
          total={deviceStats.alarm?.total || 0}
          trend={-0.5}
          color="yellow"
          icon={<Bell size={24} />}
        />
        <KpiCard
          title="今日告警数"
          value={deviceStats.todayAlerts || 0}
          trend={15.8}
          color="red"
          icon={<Activity size={24} />}
        />
      </div>

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        <div className="col-span-6 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <HeatmapLayer />
        </div>
        <div className="col-span-3 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <RiskPrediction />
        </div>
        <div className="col-span-3 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <AlertList />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
