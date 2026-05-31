import React, { useEffect } from 'react';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { DeviceRankingItem } from '../../shared/types.js';
import { Camera, Accessibility, Bell } from 'lucide-react';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  camera: <Camera size={14} />,
  access: <Accessibility size={14} />,
  alarm: <Bell size={14} />
};

const TYPE_COLORS: Record<string, string> = {
  camera: 'text-cyan-400',
  access: 'text-green-400',
  alarm: 'text-red-400'
};

const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-red-500/20', text: 'text-red-400', label: '高危' },
  medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '中危' },
  low: { bg: 'bg-green-500/20', text: 'text-green-400', label: '低危' }
};

export const AreaDeviceRanking: React.FC = () => {
  const deviceRanking = useSecurityStore(state => state.deviceRanking);
  const fetchDeviceRanking = useSecurityStore(state => state.fetchDeviceRanking);
  const selectedTimeRange = useSecurityStore(state => state.selectedTimeRange);

  useEffect(() => {
    fetchDeviceRanking();
    const interval = setInterval(fetchDeviceRanking, 60000);
    return () => clearInterval(interval);
  }, [fetchDeviceRanking, selectedTimeRange]);

  return (
    <div className="h-full flex flex-col p-4">
      <h3 className="text-cyan-400 font-bold text-base mb-3">区域点位排名</h3>

      <div className="flex items-center gap-3 mb-3 text-xs text-slate-400">
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyan-400" />摄像头</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-400" />门禁</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400" />报警器</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {(deviceRanking || []).length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">暂无排名数据</div>
        ) : (
          (deviceRanking || []).slice(0, 15).map((item: DeviceRankingItem, idx: number) => {
            const risk = RISK_STYLES[item.riskLevel] || RISK_STYLES.low;
            return (
              <div
                key={`${item.deviceId}-${idx}`}
                className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2 hover:bg-slate-700/50 transition-colors"
              >
                <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${
                  idx < 3 ? 'bg-cyan-500/30 text-cyan-300' : 'bg-slate-700 text-slate-400'
                }`}>
                  {idx + 1}
                </span>

                <div className={`${TYPE_COLORS[item.deviceType] || 'text-slate-400'}`}>
                  {TYPE_ICONS[item.deviceType] || TYPE_ICONS.alarm}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 truncate">{item.deviceName}</div>
                  <div className="text-xs text-slate-500">{item.areaName}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    异常分: <span className="text-white font-medium">{item.anomalyScore}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    告警: <span className="text-white">{item.alertCount}</span>
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${risk.bg} ${risk.text}`}>
                    {risk.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AreaDeviceRanking;
