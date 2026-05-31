import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PeakHourChartProps {
  data: { hour: number; avgFlow: number; isPeak: boolean }[];
  height?: number;
}

export default function PeakHourChart({ data, height = 250 }: PeakHourChartProps) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="hour"
            stroke="#64748b"
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => `${value}:00`}
          />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number) => [value.toLocaleString(), '平均客流']}
            labelFormatter={(label) => `${label}:00`}
          />
          <Bar dataKey="avgFlow" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.isPeak ? '#ef4444' : '#3b82f6'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
