import type { StationStats } from '@/types';
import { TrendingUp, Users, AlertTriangle } from 'lucide-react';

interface StationStatsPanelProps {
  stats: StationStats[];
  onStationClick?: (stationId: string) => void;
  limit?: number;
}

export default function StationStatsPanel({
  stats,
  onStationClick,
  limit = 10,
}: StationStatsPanelProps) {
  const sortedStats = [...stats].sort((a, b) => b.totalFlowToday - a.totalFlowToday);
  const displayStats = sortedStats.slice(0, limit);

  const maxFlow = Math.max(...stats.map(s => s.totalFlowToday));

  return (
    <div className="space-y-3">
      {displayStats.map((stat) => {
        const percentage = maxFlow > 0 ? (stat.totalFlowToday / maxFlow) * 100 : 0;
        return (
          <div
            key={stat.stationId}
            className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-cyan-500/50 transition-all cursor-pointer"
            onClick={() => onStationClick?.(stat.stationId)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">{stat.stationName}</span>
              {stat.alertCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/20 px-2 py-0.5 rounded">
                  <AlertTriangle className="w-3 h-3" />
                  {stat.alertCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {stat.totalFlowToday.toLocaleString()} 人次
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                峰值 {stat.peakFlow.toLocaleString()}
              </span>
            </div>
            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
