import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import type { PredictionResult, PredictionPoint } from '@/types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PredictionChartProps {
  prediction: PredictionResult;
  historicalData: { timestamp: string; totalFlow: number }[];
  height?: number;
}

export default function PredictionChart({ prediction, historicalData, height = 350 }: PredictionChartProps) {
  const chartData = [
    ...historicalData.slice(-6).map(d => ({
      timestamp: d.timestamp,
      actual: d.totalFlow,
      predicted: null,
      lowerBound: null,
      upperBound: null,
      isPrediction: false
    })),
    ...prediction.predictions.map((p: PredictionPoint) => ({
      timestamp: p.timestamp,
      actual: null,
      predicted: p.predictedFlow,
      lowerBound: p.lowerBound,
      upperBound: p.upperBound,
      isPrediction: true,
      confidence: p.confidence
    }))
  ];

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const getTrendIcon = () => {
    switch (prediction.trendDirection) {
      case 'up': return <TrendingUp className="w-5 h-5 text-green-400" />;
      case 'down': return <TrendingDown className="w-5 h-5 text-red-400" />;
      default: return <Minus className="w-5 h-5 text-slate-400" />;
    }
  };

  const getTrendText = () => {
    switch (prediction.trendDirection) {
      case 'up': return '上升趋势';
      case 'down': return '下降趋势';
      default: return '平稳趋势';
    }
  };

  const getTrendColor = () => {
    switch (prediction.trendDirection) {
      case 'up': return 'text-green-400';
      case 'down': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">{prediction.stationName} - 客流预测</h3>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg">
            {getTrendIcon()}
            <span className={`text-sm font-medium ${getTrendColor()}`}>{getTrendText()}</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-400">预测峰值: </span>
            <span className="text-cyan-400 font-bold">{prediction.predictedPeak.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400">峰值时间: </span>
            <span className="text-white font-medium">{prediction.predictedPeakTime}</span>
          </div>
          <div>
            <span className="text-slate-400">模型准确度: </span>
            <span className="text-green-400 font-medium">{prediction.modelAccuracy}%</span>
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="timestamp"
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickFormatter={formatTime}
            />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#fff',
              }}
              labelFormatter={(label) => formatTime(label as string)}
              formatter={(value: number | null, name: string) => {
                if (value === null) return ['-', name];
                const labels: Record<string, string> = {
                  actual: '实际客流',
                  predicted: '预测客流',
                  lowerBound: '下限',
                  upperBound: '上限'
                };
                return [value.toLocaleString(), labels[name] || name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => {
                const labels: Record<string, string> = {
                  actual: '实际客流',
                  predicted: '预测客流',
                  confidence: '置信区间'
                };
                return labels[value] || value;
              }}
            />
            <Area
              type="monotone"
              dataKey="upperBound"
              stroke="none"
              fill="url(#colorConfidence)"
              fillOpacity={0.3}
            />
            <Area
              type="monotone"
              dataKey="lowerBound"
              stroke="none"
              fill="#0f172a"
              fillOpacity={1}
            />
            <Area
              type="monotone"
              dataKey="actual"
              stroke="#06b6d4"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorActual)"
            />
            <Area
              type="monotone"
              dataKey="predicted"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 5"
              fillOpacity={0.5}
              fill="url(#colorPredicted)"
            />
            <ReferenceLine
              x={chartData.find(d => d.isPrediction)?.timestamp}
              stroke="#f59e0b"
              strokeDasharray="3 3"
              label={{ value: '预测开始', position: 'top', fill: '#f59e0b', fontSize: 11 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-6 gap-2">
        {prediction.predictions.map((p, index) => (
          <div key={index} className="bg-slate-800/30 rounded-lg p-2 text-center">
            <p className="text-xs text-slate-400">
              {new Date(p.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-sm font-bold text-orange-400">{p.predictedFlow.toLocaleString()}</p>
            <div className="flex items-center justify-center gap-1 text-xs">
              <span className="text-slate-500">置信度</span>
              <span className={p.confidence > 80 ? 'text-green-400' : p.confidence > 60 ? 'text-yellow-400' : 'text-orange-400'}>
                {p.confidence}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
