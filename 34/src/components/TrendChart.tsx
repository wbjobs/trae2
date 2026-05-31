import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { StationFlow } from '@/types';

interface TrendChartProps {
  data: { timestamp: string; inflow: number; outflow: number; totalFlow: number }[];
  height?: number;
  showLegend?: boolean;
}

export default function TrendChart({ data, height = 300, showLegend = true }: TrendChartProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="timestamp"
            stroke="#64748b"
            tickFormatter={formatTime}
            tick={{ fontSize: 11 }}
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
            formatter={(value: number, name: string) => [
              value.toLocaleString(),
              name === 'inflow' ? '进站' : name === 'outflow' ? '出站' : '总计',
            ]}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => {
                const labels: Record<string, string> = {
                  inflow: '进站客流',
                  outflow: '出站客流',
                  totalFlow: '总客流',
                };
                return labels[value] || value;
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="inflow"
            stroke="#06b6d4"
            fillOpacity={1}
            fill="url(#colorInflow)"
          />
          <Area
            type="monotone"
            dataKey="outflow"
            stroke="#f59e0b"
            fillOpacity={1}
            fill="url(#colorOutflow)"
          />
          <Area
            type="monotone"
            dataKey="totalFlow"
            stroke="#3b82f6"
            fillOpacity={1}
            fill="url(#colorTotal)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
