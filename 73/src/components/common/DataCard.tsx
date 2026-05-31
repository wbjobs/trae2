import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface DataCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  trend?: number;
  color?: string;
}

const DataCard: React.FC<DataCardProps> = ({
  title,
  value,
  unit,
  icon,
  trend,
  color = '#2dd4bf',
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const numericValue = typeof value === 'number' ? value : parseFloat(value) || 0;

  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const increment = numericValue / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= numericValue) {
        setDisplayValue(numericValue);
        clearInterval(timer);
      } else {
        setDisplayValue(current);
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [numericValue]);

  const formatValue = (val: number) => {
    if (typeof value === 'string') return value;
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(2) + 'K';
    return val.toFixed(2);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer group"
      style={{
        background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
        border: `1px solid ${color}30`,
      }}
    >
      <div
        className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-20 blur-2xl transition-all duration-500 group-hover:opacity-40"
        style={{ backgroundColor: color }}
      />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>
          {icon && (
            <div
              className="p-3 rounded-xl transition-transform duration-300 group-hover:rotate-12"
              style={{ backgroundColor: `${color}20`, color: color }}
            >
              {icon}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold text-gray-900 dark:text-white">
            {typeof value === 'number' ? formatValue(displayValue) : value}
          </span>
          {unit && <span className="text-sm text-gray-500 dark:text-gray-400">{unit}</span>}
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1">
            {trend >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-500" />
            )}
            <span
              className={`text-sm font-medium ${
                trend >= 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}
            >
              {trend >= 0 ? '+' : ''}
              {trend.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-400">较上周</span>
          </div>
        )}
      </div>
    </div>
  );
};

export { DataCard };
