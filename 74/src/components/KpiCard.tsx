import React from 'react';
import { cn } from '../lib/utils.js';

interface KpiCardProps {
  title: string;
  value: string | number;
  total?: number;
  unit?: string;
  trend?: number | {
    value: number;
    direction: 'up' | 'down' | 'stable';
  };
  icon?: React.ReactNode | React.ComponentType<any>;
  color?: 'cyan' | 'green' | 'yellow' | 'red' | 'purple';
  className?: string;
}

const colorClasses: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    glow: 'shadow-cyan-500/20'
  },
  green: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-400',
    glow: 'shadow-green-500/20'
  },
  yellow: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    glow: 'shadow-yellow-500/20'
  },
  red: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    glow: 'shadow-red-500/20'
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    glow: 'shadow-purple-500/20'
  }
};

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  total,
  unit,
  trend,
  icon: Icon,
  color = 'cyan',
  className
}) => {
  const colors = colorClasses[color];

  const normalizedTrend = typeof trend === 'number'
    ? { value: Math.abs(trend), direction: trend >= 0 ? 'up' as const : 'down' as const }
    : trend;

  const IconComponent = Icon as React.ComponentType<any>;
  const iconNode = Icon ? (
    React.isValidElement(Icon)
      ? (Icon as React.ReactNode)
      : typeof Icon === 'function'
        ? React.createElement(IconComponent, { size: 24 })
        : (Icon as React.ReactNode)
  ) : null;

  return (
    <div className={cn(
      'relative overflow-hidden rounded-lg border p-4 transition-all duration-300',
      colors.bg,
      colors.border,
      'shadow-lg hover:shadow-xl',
      colors.glow,
      className
    )}>
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-50"
        style={{ color: color === 'cyan' ? '#00d4ff' : color === 'green' ? '#2ed573' : color === 'yellow' ? '#ffa502' : color === 'red' ? '#ff4757' : '#a855f7' }}
      />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={cn('text-3xl font-bold font-mono', colors.text)}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {total !== undefined && (
              <span className="text-sm text-gray-500">/ {total}</span>
            )}
            {unit && <span className="text-sm text-gray-400">{unit}</span>}
          </div>
          {normalizedTrend && (
            <div className={cn(
              'mt-2 flex items-center gap-1 text-sm',
              normalizedTrend.direction === 'up' ? 'text-red-400' : normalizedTrend.direction === 'down' ? 'text-green-400' : 'text-gray-400'
            )}>
              <span>{normalizedTrend.direction === 'up' ? '↑' : normalizedTrend.direction === 'down' ? '↓' : '→'}</span>
              <span>{Math.abs(normalizedTrend.value)}%</span>
              <span className="text-gray-500">较上期</span>
            </div>
          )}
        </div>
        {iconNode && (
          <div className={cn('p-3 rounded-lg opacity-80', colors.bg)}>
            {iconNode}
          </div>
        )}
      </div>

      <div className="absolute bottom-0 right-0 w-20 h-20 opacity-10">
        <div className="absolute bottom-0 right-0 w-full h-full rounded-full bg-current"
          style={{ color: color === 'cyan' ? '#00d4ff' : color === 'green' ? '#2ed573' : color === 'yellow' ? '#ffa502' : color === 'red' ? '#ff4757' : '#a855f7' }}
        />
      </div>
    </div>
  );
};

export default KpiCard;
