import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface RadarChartProps {
  indicators: { name: string; max: number }[];
  data: { name: string; value: number[] }[];
  title?: string;
  height?: number;
}

const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const RadarChart: React.FC<RadarChartProps> = ({ indicators, data, title, height = 400 }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current = echarts.init(chartRef.current);

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!chartInstance.current) return;

    const option: echarts.EChartsOption = {
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 16, color: '#374151' } } : undefined,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        textStyle: { color: '#374151' },
      },
      legend: {
        data: data.map((d) => d.name),
        bottom: 5,
        textStyle: { color: '#6b7280', fontSize: 11 },
        type: 'scroll',
        pageIconColor: '#6b7280',
        pageTextStyle: { color: '#6b7280' },
      },
      radar: {
        indicator: indicators,
        shape: 'polygon',
        center: ['50%', title ? '52%' : '48%'],
        radius: '55%',
        splitNumber: 5,
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
            color: '#d1d5db',
          },
        },
      },
      series: [
        {
          type: 'radar',
          data: data.map((d, index) => {
            const color = colors[index % colors.length];
            return {
              name: d.name,
              value: d.value,
              symbol: 'circle',
              symbolSize: 6,
              lineStyle: {
                width: 2,
                color,
              },
              areaStyle: {
                color: `${color}30`,
              },
              itemStyle: {
                color,
              },
            };
          }),
        },
      ],
    };

    chartInstance.current.setOption(option, true);
  }, [indicators, data, title]);

  return <div ref={chartRef} style={{ width: '100%', height }} />;
};

export default RadarChart;
