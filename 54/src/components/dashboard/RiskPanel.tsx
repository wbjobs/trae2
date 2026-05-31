import { useDashboardStore } from '../../store/dashboardStore';
import { getRiskColor, getRiskLabel } from '../../utils/format';
import { BarChart3, AlertCircle, MapPin } from 'lucide-react';

const RiskPanel = () => {
  const { riskStats } = useDashboardStore();

  if (!riskStats) {
    return (
      <div className="bg-gradient-to-br from-[#0d1f3c]/80 to-[#0a1628]/80 rounded-xl border border-[#00d4ff]/20 p-4 h-full flex items-center justify-center">
        <p className="text-[#5a7a9a]">加载中...</p>
      </div>
    );
  }

  const maxHourlyCount = Math.max(...riskStats.hourlyRisk.map((h) => h.count), 1);
  const maxLevel = 10;

  return (
    <div className="bg-gradient-to-br from-[#0d1f3c]/80 to-[#0a1628]/80 rounded-xl border border-[#00d4ff]/20 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[#00d4ff]" />
          <h3 className="text-white font-semibold">风险统计分析</h3>
        </div>
        <div
          className="px-3 py-1 rounded-lg font-mono font-bold"
          style={{
            backgroundColor: `${getRiskColor(riskStats.currentRisk.category)}20`,
            color: getRiskColor(riskStats.currentRisk.category),
          }}
        >
          {getRiskLabel(riskStats.currentRisk.category)} ({riskStats.currentRisk.level.toFixed(1)})
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {(['low', 'medium', 'high', 'critical'] as const).map((level) => (
          <div
            key={level}
            className="p-3 rounded-lg text-center"
            style={{ backgroundColor: `${getRiskColor(level)}15` }}
          >
            <div
              className="text-2xl font-bold font-mono"
              style={{ color: getRiskColor(level) }}
            >
              {riskStats.levelDistribution[level]}
            </div>
            <div className="text-xs text-[#8aa4c4]">{getRiskLabel(level)}</div>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-[#00d4ff]" />
          <span className="text-sm text-[#8aa4c4]">24小时风险分布</span>
        </div>
        <div className="h-24 flex items-end gap-1 bg-[#0a1628]/50 rounded-lg p-2">
          {riskStats.hourlyRisk.map((hour, index) => {
            const height = (hour.level / maxLevel) * 100;
            return (
              <div
                key={index}
                className="flex-1 flex flex-col items-center gap-1 group relative"
              >
                <div
                  className="w-full rounded-t transition-all duration-300"
                  style={{
                    height: `${Math.max(4, height)}%`,
                    backgroundColor:
                      hour.level > 7
                        ? '#ff3366'
                        : hour.level > 4
                        ? '#ff6b35'
                        : hour.level > 2
                        ? '#ffc107'
                        : '#4caf50',
                    opacity: hour.count > 0 ? 1 : 0.3,
                  }}
                />
                <span className="text-[10px] text-[#5a7a9a] font-mono">
                  {hour.hour.toString().padStart(2, '0')}
                </span>
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#0a1628] border border-[#00d4ff]/30 rounded px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  {hour.hour}时: 风险等级 {hour.level.toFixed(1)}, {hour.count}条数据
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-4 h-4 text-[#00d4ff]" />
          <span className="text-sm text-[#8aa4c4]">高风险区域排行</span>
        </div>
        <div className="space-y-2 overflow-y-auto h-[calc(100%-24px)]">
          {riskStats.topRiskLocations.slice(0, 5).map((loc, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-2 bg-[#0a1628]/50 rounded-lg"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0
                    ? 'bg-[#ff3366] text-white'
                    : index === 1
                    ? 'bg-[#ff6b35] text-white'
                    : index === 2
                    ? 'bg-[#ffc107] text-[#0a1628]'
                    : 'bg-[#8aa4c4]/30 text-[#8aa4c4]'
                }`}
              >
                {index + 1}
              </span>
              <span className="text-sm text-[#8aa4c4] flex-1">{loc.location}</span>
              <div className="text-right">
                <div className="text-sm font-mono text-white">{loc.riskCount} 次</div>
                <div
                  className="text-xs font-mono"
                  style={{ color: getRiskColor(loc.avgLevel > 7 ? 'critical' : loc.avgLevel > 4 ? 'high' : loc.avgLevel > 2 ? 'medium' : 'low') }}
                >
                  平均 {loc.avgLevel.toFixed(1)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RiskPanel;
