import React from 'react';
import type { StationStatus } from '@/types';

interface StatusBadgeProps {
  status: StationStatus;
  text?: string;
}

const statusConfig = {
  online: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    label: '在线',
  },
  offline: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-400',
    dot: 'bg-gray-400',
    label: '离线',
  },
  maintenance: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-400',
    dot: 'bg-orange-500',
    label: '维护中',
  },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, text }) => {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${config.bg} ${config.text}`}
    >
      <span className={`relative flex h-2.5 w-2.5`}>
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-75`}
        />
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${config.dot}`} />
      </span>
      {text || config.label}
    </span>
  );
};

export { StatusBadge };
