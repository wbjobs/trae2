import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface GaugeChartProps {
  value: number;
  title?: string;
  unit?: string;
  min?: number;
  max?: number;
  height?: number;
  colorStops?: Array<{ offset: number; color: string }>;
}

const GaugeChart: React.FC<GaugeChartProps> = ({
  value,
  title,
  unit = '',
  min = 0,
  max = 100,
  height = 220,
  colorStops,
}) => {
  const defaultColorStops = [
    { offset: 0, color: '#ef4444' },
    { offset: 0.5, color: '#f59e0b' },
    { offset: 0.7, color: '#84cc16' },
    { offset: 1, color: '#10b981' },
  ];

  const option: EChartsOption = useMemo(() => {
    return {
      title: title ? {
        text: title,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 13,
          fontWeight: 'normal',
          color: '#1e3a5f',
        },
      } : undefined,
      series: [
        {
          type: 'gauge',
          startAngle: 200,
          endAngle: -20,
          min,
          max,
          splitNumber: 10,
          radius: '85%',
          center: ['50%', '55%'],
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: colorStops || defaultColorStops,
            },
          },
          progress: {
            show: true,
            width: 12,
            roundCap: true,
          },
          pointer: {
            show: false,
          },
          axisLine: {
            lineStyle: {
              width: 12,
              color: [[1, '#f0f0f0']],
            },
            roundCap: true,
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
          axisLabel: {
            show: false,
          },
          anchor: {
            show: false,
          },
          title: {
            show: false,
          },
          detail: {
            valueAnimation: true,
            lineHeight: 40,
            fontSize: 28,
            fontWeight: 'bold',
            formatter: `{value}${unit}`,
            color: '#1e3a5f',
            offsetCenter: [0, 0],
          },
          data: [{ value }],
        },
      ],
    };
  }, [value, title, unit, min, max, colorStops]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default GaugeChart;
