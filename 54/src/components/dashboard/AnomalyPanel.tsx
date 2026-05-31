import { useDashboardStore } from '../../store/dashboardStore';
import { getRiskColor, getRiskLabel, formatTime } from '../../utils/format';
import { AlertTriangle, PieChart } from 'lucide-react';

const AnomalyPanel = () => {
  const { anomalies } = useDashboardStore();

  const typeStats = anomalies.reduce(
    (acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const typeLabels: Record<string, string> = {
    temperature: '温度异常',
    humidity: '湿度异常',
    gas: '气体异常',
    device: '设备异常',
  };

  const typeColors: Record<string, string> = {
    temperature: '#ff6b35',
    humidity: '#00d4ff',
    gas: '#9c27b0',
    device: '#ff3366',
  };

  return (
    <div className="bg-gradient-to-br from-[#0d1f3c]/80 to-[#0a1628]/80 rounded-xl border border-[#00d4ff]/20 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[#ff6b35]" />
          <h3 className="text-white font-semibold">异常聚类分析</h3>
        </div>
        <span className="px-2 py-1 bg-[#ff6b35]/20 text-[#ff6b35] text-sm rounded-lg">
          {anomalies.length} 个异常
        </span>
      </div>

      <div className="flex items-center gap-4 mb-4 p-3 bg-[#0a1628]/50 rounded-lg">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full transform -rotate-90">
            {Object.entries(typeStats).map(([type, count], index) => {
              const total = Object.values(typeStats).reduce((a, b) => a + b, 0);
              const percentage = (count / total) * 100;
              const strokeDasharray = `${percentage * 1.51} 151`;
              const offset = Object.entries(typeStats)
                .slice(0, index)
                .reduce((acc, [, c]) => acc + (c / total) * 151, 0);

              return (
                <circle
                  key={type}
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke={typeColors[type]}
                  strokeWidth="12"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={-offset}
                />
              );
            })}
            <circle
              cx="48"
              cy="48"
              r="30"
              fill="#0a1628"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-white">{anomalies.length}</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {Object.entries(typeStats).map(([type, count]) => (
            <div key={type} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: typeColors[type] }}
                />
                <span className="text-sm text-[#8aa4c4]">{typeLabels[type]}</span>
              </div>
              <span className="text-sm font-mono text-white">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
        {anomalies.slice(0, 10).map((anomaly) => (
          <div
            key={anomaly.id}
            className="p-3 rounded-lg border-l-4 bg-[#0a1628]/50 hover:bg-[#0a1628]/80 transition-colors"
            style={{ borderColor: getRiskColor(anomaly.level) }}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="px-2 py-0.5 text-xs rounded font-semibold"
                style={{
                  backgroundColor: `${getRiskColor(anomaly.level)}20`,
                  color: getRiskColor(anomaly.level),
                }}
              >
                {getRiskLabel(anomaly.level)}
              </span>
              <span className="text-xs text-[#5a7a9a]">
                {typeLabels[anomaly.type]}
              </span>
            </div>
            <div className="text-xs text-[#8aa4c4]">
              <div className="flex justify-between">
                <span>设备: {anomaly.deviceId}</span>
                <span>位置: ({anomaly.location.x.toFixed(0)}, {anomaly.location.y.toFixed(0)})</span>
              </div>
              <div className="mt-1">
                时间: {formatTime(anomaly.startTime)} - {formatTime(anomaly.endTime)}
              </div>
              <div className="mt-1">
                数据点: {anomaly.dataPoints.length} 个
              </div>
            </div>
          </div>
        ))}
        {anomalies.length === 0 && (
          <div className="text-center py-8 text-[#5a7a9a]">
            <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>暂无异常数据</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnomalyPanel;
