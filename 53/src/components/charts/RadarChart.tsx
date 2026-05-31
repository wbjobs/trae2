import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface RadarIndicator {
  name: string;
  max: number;
}

interface RadarSeries {
  name: string;
  value: number[];
  color?: string;
}

interface RadarChartProps {
  indicators: RadarIndicator[];
  series: RadarSeries[];
  title?: string;
  height?: number;
}

const defaultColors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

const RadarChart: React.FC<RadarChartProps> = ({
  indicators,
  series,
  title,
  height = 300,
}) => {
  const option: EChartsOption = useMemo(() => {
    return {
      title: title ? {
        text: title,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 14,
          fontWeight: 'normal',
          color: '#1e3a5f',
        },
      } : undefined,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: {
          color: '#374151',
        },
      },
      legend: series.length > 1 ? {
        bottom: 10,
        left: 'center',
        itemWidth: 12,
        itemHeight: 8,
        textStyle: {
          fontSize: 11,
          color: '#6b7280',
        },
      } : undefined,
      radar: {
        indicator,
        shape: 'polygon',
        splitNumber: 4,
        axisName: {
          color: '#374151',
          fontSize: 11,
        },
        splitLine: {
          lineStyle: {
            color: '#e5e7eb',
          },
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['#f9fafb', '#f3f4f6'],
          },
        },
        axisLine: {
          lineStyle: {
            color: '#e5e7eb',
          },
        },
        radius: '55%',
        center: ['50%', '50%'],
      },
      series: [
        {
          type: 'radar',
          data: series.map((s, index) => ({
            name: s.name,
            value: s.value,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: {
              width: 2,
              color: s.color || defaultColors[index % defaultColors.length],
            },
            itemStyle: {
              color: s.color || defaultColors[index % defaultColors.length],
            },
            areaStyle: {
              color: (s.color || defaultColors[index % defaultColors.length]) + '30',
            },
          })),
        },
      ],
    };
  }, [indicators, series, title]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default RadarChart;
