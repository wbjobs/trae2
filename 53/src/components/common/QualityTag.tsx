import React from 'react';
import { cn } from '../../lib/utils';
import type { WaterQuality } from '../../types';

interface QualityTagProps {
  quality: WaterQuality;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const qualityConfig = {
  excellent: {
    text: '优',
    bg: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  good: {
    text: '良',
    bg: 'bg-sky-100',
    textColor: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  moderate: {
    text: '轻度污染',
    bg: 'bg-amber-100',
    textColor: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  poor: {
    text: '重度污染',
    bg: 'bg-red-100',
    textColor: 'text-red-700',
    dot: 'bg-red-500',
  },
};

const sizeConfig = {
  sm: {
    container: 'px-2 py-0.5 text-xs',
    dot: 'w-1.5 h-1.5',
  },
  md: {
    container: 'px-2.5 py-1 text-xs',
    dot: 'w-2 h-2',
  },
  lg: {
    container: 'px-3 py-1.5 text-sm',
    dot: 'w-2.5 h-2.5',
  },
};

const QualityTag: React.FC<QualityTagProps> = ({
  quality,
  size = 'md',
  showText = true,
}) => {
  const config = qualityConfig[quality];
  const sizes = sizeConfig[size];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        config.bg,
        config.textColor,
        sizes.container
      )}
    >
      <span className={cn('rounded-full', sizes.dot)} />
      {showText && config.text}
    </span>
  );
};

export default QualityTag;
