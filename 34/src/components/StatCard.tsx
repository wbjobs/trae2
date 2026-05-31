interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  color?: 'cyan' | 'blue' | 'green' | 'orange' | 'red';
  className?: string;
}

const colorClasses = {
  cyan: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-400',
  blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400',
  green: 'from-green-500/20 to-green-600/10 border-green-500/30 text-green-400',
  orange: 'from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-400',
  red: 'from-red-500/20 to-red-600/10 border-red-500/30 text-red-400',
};

export default function StatCard({
  title,
  value,
  icon,
  trend,
  color = 'cyan',
  className = '',
}: StatCardProps) {
  return (
    <div
      className={`bg-gradient-to-br ${colorClasses[color]} backdrop-blur-sm rounded-xl border p-4 ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400 mb-1">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {trend && (
            <p
              className={`text-xs mt-1 flex items-center gap-1 ${
                trend.isPositive ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {icon && <div className="text-2xl opacity-50">{icon}</div>}
      </div>
    </div>
  );
}
