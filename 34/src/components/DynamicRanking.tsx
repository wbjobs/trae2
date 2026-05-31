import { useEffect, useState, useRef } from 'react';
import type { RankingResult, RankedStation } from '@/types';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

interface DynamicRankingProps {
  data: RankingResult | null;
  onStationClick?: (stationId: string) => void;
  limit?: number;
}

export default function DynamicRanking({ data, onStationClick, limit = 10 }: DynamicRankingProps) {
  const [displayRankings, setDisplayRankings] = useState<RankedStation[]>([]);
  const prevDataRef = useRef<RankedStation[]>([]);
  const [animatingChanges, setAnimatingChanges] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!data) return;

    const newRankings = data.rankings.slice(0, limit);
    const changes = new Map<string, number>();

    newRankings.forEach(station => {
      const prevStation = prevDataRef.current.find(s => s.stationId === station.stationId);
      if (prevStation && prevStation.rank !== station.rank) {
        changes.set(station.stationId, station.rank);
      }
    });

    setDisplayRankings(newRankings);
    setAnimatingChanges(changes);
    prevDataRef.current = newRankings;

    if (changes.size > 0) {
      setTimeout(() => setAnimatingChanges(new Map()), 1000);
    }
  }, [data, limit]);

  const getRankChangeIcon = (station: RankedStation) => {
    if (station.rankChange > 0) return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (station.rankChange < 0) return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-slate-500" />;
  };

  const getRankChangeColor = (change: number) => {
    if (change > 0) return 'text-green-400';
    if (change < 0) return 'text-red-400';
    return 'text-slate-500';
  };

  const getGrowthColor = (growthRate: number) => {
    if (growthRate > 0.1) return 'text-green-400';
    if (growthRate < -0.1) return 'text-red-400';
    return 'text-slate-400';
  };

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return 'bg-yellow-500 text-yellow-900';
    if (rank === 2) return 'bg-slate-400 text-slate-900';
    if (rank === 3) return 'bg-orange-600 text-orange-100';
    return 'bg-slate-700 text-slate-300';
  };

  if (!data || displayRankings.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 text-center">
        <p className="text-slate-500">暂无排名数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayRankings.map((station, index) => {
        const isAnimating = animatingChanges.has(station.stationId);
        const maxFlow = Math.max(...displayRankings.map(s => s.totalFlow));
        const progress = maxFlow > 0 ? (station.totalFlow / maxFlow) * 100 : 0;

        return (
          <div
            key={station.stationId}
            className={`bg-slate-800/50 rounded-lg p-3 border transition-all duration-500 cursor-pointer hover:border-cyan-500/50 ${
              isAnimating ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-700/50'
            }`}
            onClick={() => onStationClick?.(station.stationId)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${getRankBadgeColor(station.rank)}`}>
                {station.rank}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate">{station.stationName}</span>
                  <div className="flex items-center gap-2">
                    {getRankChangeIcon(station)}
                    <span className={`text-xs font-medium ${getRankChangeColor(station.rankChange)}`}>
                      {station.rankChange > 0 ? `+${station.rankChange}` : station.rankChange}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs">
                  <span className="text-slate-400">{station.lineName}</span>
                  <span className={getGrowthColor(station.growthRate)}>
                    {station.growthRate > 0 ? '+' : ''}{(station.growthRate * 100).toFixed(1)}%
                  </span>
                  {station.alertCount > 0 && (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertTriangle className="w-3 h-3" />
                      {station.alertCount}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-cyan-400">{station.totalFlow.toLocaleString()}</p>
                <p className="text-xs text-slate-500">人次</p>
              </div>
            </div>

            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  station.rankChange > 0 ? 'bg-gradient-to-r from-green-500 to-cyan-500' :
                  station.rankChange < 0 ? 'bg-gradient-to-r from-red-500 to-orange-500' :
                  'bg-gradient-to-r from-cyan-500 to-blue-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        );
      })}

      {data.topGainers.length > 0 && (
        <div className="mt-6 p-4 bg-green-500/10 rounded-lg border border-green-500/30">
          <h4 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            涨幅榜 TOP 5
          </h4>
          <div className="space-y-2">
            {data.topGainers.map((station, index) => (
              <div key={station.stationId} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{index + 1}. {station.stationName}</span>
                <span className="text-green-400 font-medium">+{(station.growthRate * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.topLosers.length > 0 && (
        <div className="mt-4 p-4 bg-red-500/10 rounded-lg border border-red-500/30">
          <h4 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4" />
            跌幅榜 TOP 5
          </h4>
          <div className="space-y-2">
            {data.topLosers.map((station, index) => (
              <div key={station.stationId} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{index + 1}. {station.stationName}</span>
                <span className="text-red-400 font-medium">{(station.growthRate * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
