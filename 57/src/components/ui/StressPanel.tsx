import { useMemo } from 'react';
import { Thermometer, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useBridgeStore } from '../../store/useBridgeStore';

export function StressPanel() {
  const { stressResults, viewMode } = useBridgeStore();

  const stressData = useMemo(() => {
    if (stressResults.length === 0) return null;
    return stressResults[0];
  }, [stressResults]);

  const chartData = useMemo(() => {
    if (!stressData) return [];
    return stressData.stressDistribution.map((stress, index) => ({
      index,
      stress,
    }));
  }, [stressData]);

  if (viewMode !== 'stress' || !stressData) {
    return null;
  }

  return (
    <div className="absolute top-4 right-4 z-10 w-72 bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
        <Thermometer className="w-5 h-5 text-orange-400" />
        <span className="font-semibold text-slate-100">应力分析</span>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1 text-red-400 text-xs mb-1">
              <TrendingUp className="w-3 h-3" />
              <span>最大应力</span>
            </div>
            <p className="text-xl font-bold text-slate-100">
              {stressData.maxStress.toFixed(1)}
              <span className="text-xs text-slate-400 ml-1">MPa</span>
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1 text-blue-400 text-xs mb-1">
              <TrendingDown className="w-3 h-3" />
              <span>最小应力</span>
            </div>
            <p className="text-xl font-bold text-slate-100">
              {stressData.minStress.toFixed(1)}
              <span className="text-xs text-slate-400 ml-1">MPa</span>
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-2">应力分布</p>
          <div className="h-24 bg-slate-800/30 rounded-lg overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="stressGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="index" hide />
                <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [`${value.toFixed(1)} MPa`, '应力']}
                />
                <Area
                  type="monotone"
                  dataKey="stress"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  fill="url(#stressGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-2">应力色谱</p>
          <div
            className="h-4 rounded-full"
            style={{
              background: 'linear-gradient(to right, #3B82F6, #22C55E, #EAB308, #F97316, #EF4444)',
            }}
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>低</span>
            <span>高</span>
          </div>
        </div>
      </div>
    </div>
  );
}
