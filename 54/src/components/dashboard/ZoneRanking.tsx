import { ZoneData } from '../../../shared/types';
import { getRiskColor, getRiskLabel } from '../../utils/format';
import { Trophy, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

interface ZoneRankingProps {
  zones: ZoneData[];
  rankings: {
    highestRisk: ZoneData[];
    lowestRisk: ZoneData[];
    mostAnomalies: ZoneData[];
  } | null;
}

const ZoneRanking = ({ zones, rankings }: ZoneRankingProps) => {
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingDown className="w-4 h-4 text-green-500" />;
      case 'worsening':
        return <TrendingUp className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-[#8aa4c4]" />;
    }
  };

  const getTrendLabel = (trend: string) => {
    switch (trend) {
      case 'improving':
        return '好转';
      case 'worsening':
        return '恶化';
      default:
        return '稳定';
    }
  };

  const getRankBadge = (index: number) => {
    if (index === 0)
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-[10px] font-bold text-white">
          1
        </div>
      );
    if (index === 1)
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center text-[10px] font-bold text-white">
          2
        </div>
      );
    if (index === 2)
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-[10px] font-bold text-white">
          3
        </div>
      );
    return (
      <div className="w-6 h-6 rounded-full bg-[#0a1628] border border-[#00d4ff]/30 flex items-center justify-center text-[10px] text-[#8aa4c4]">
        {index + 1}
      </div>
    );
  };

  return (
    <div className="bg-gradient-to-br from-[#0d1f3c]/80 to-[#0a1628]/80 rounded-xl border border-[#00d4ff]/20 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#ffc107]" />
          <h3 className="text-white font-semibold">管廊分区排名</h3>
        </div>
        <span className="text-xs text-[#8aa4c4]">
          共 {zones.length} 个区域
        </span>
      </div>

      {rankings && (
        <div className="flex-1 grid grid-cols-3 gap-3 min-h-0">
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-red-500/10 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-400 font-semibold">高风险区域</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
              {rankings.highestRisk.map((zone, index) => (
                <div
                  key={zone.zoneId}
                  className="p-2 bg-[#0a1628]/50 rounded-lg border-l-2 transition-all hover:bg-[#0a1628]/80"
                  style={{ borderColor: getRiskColor(zone.riskLevel) }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {getRankBadge(index)}
                    <span className="text-sm text-white font-medium flex-1 truncate">
                      {zone.zoneName}
                    </span>
                    {getTrendIcon(zone.trend)}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className="px-1.5 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor: `${getRiskColor(zone.riskLevel)}20`,
                        color: getRiskColor(zone.riskLevel),
                      }}
                    >
                      {getRiskLabel(zone.riskLevel)}
                    </span>
                    <span className="text-[#8aa4c4] font-mono">
                      {zone.riskScore.toFixed(0)} 分
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-[#5a7a9a]">
                    异常: {zone.anomalyCount} 次 · 设备: {zone.deviceCount} 台
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-green-500/10 rounded-lg">
              <Trophy className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-400 font-semibold">低风险区域</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
              {rankings.lowestRisk.map((zone, index) => (
                <div
                  key={zone.zoneId}
                  className="p-2 bg-[#0a1628]/50 rounded-lg border-l-2 transition-all hover:bg-[#0a1628]/80"
                  style={{ borderColor: getRiskColor(zone.riskLevel) }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {getRankBadge(index)}
                    <span className="text-sm text-white font-medium flex-1 truncate">
                      {zone.zoneName}
                    </span>
                    {getTrendIcon(zone.trend)}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className="px-1.5 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor: `${getRiskColor(zone.riskLevel)}20`,
                        color: getRiskColor(zone.riskLevel),
                      }}
                    >
                      {getRiskLabel(zone.riskLevel)}
                    </span>
                    <span className="text-[#8aa4c4] font-mono">
                      {zone.riskScore.toFixed(0)} 分
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-[#5a7a9a]">
                    温度: {zone.avgTemperature.toFixed(1)}°C
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-orange-500/10 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-orange-400 font-semibold">异常频发区</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
              {rankings.mostAnomalies.map((zone, index) => (
                <div
                  key={zone.zoneId}
                  className="p-2 bg-[#0a1628]/50 rounded-lg border-l-2 border-orange-500/50 transition-all hover:bg-[#0a1628]/80"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {getRankBadge(index)}
                    <span className="text-sm text-white font-medium flex-1 truncate">
                      {zone.zoneName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#ff6b35] font-mono font-bold">
                      {zone.anomalyCount} 次
                    </span>
                    <span className="text-[#8aa4c4]">
                      CO₂: {zone.avgCo2.toFixed(0)} ppm
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-[#5a7a9a]">
                    <span>趋势: {getTrendLabel(zone.trend)}</span>
                    <span>湿度: {zone.avgHumidity.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!rankings && (
        <div className="flex-1 flex items-center justify-center text-[#5a7a9a]">
          <Trophy className="w-12 h-12 mr-2 opacity-30" />
          <p>加载中...</p>
        </div>
      )}
    </div>
  );
};

export default ZoneRanking;
