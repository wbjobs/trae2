import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface BarChartProps {
  data: { name: string; value: number }[];
  title?: string;
  color?: string;
  height?: number;
}

const BarChart: React.FC<BarChartProps> = ({ data, title, color = '#3b82f6', height = 400 }) => {
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

    const gradientColor = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: color },
      { offset: 1, color: `${color}33` },
    ]);

    const option: echarts.EChartsOption = {
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 16, color: '#374151' } } : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        textStyle: { color: '#374151' },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        top: title ? '70px' : '30px',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: data.map((item) => item.name),
        axisLine: { lineStyle: { color: '#d1d5db' } },
        axisLabel: { color: '#6b7280' },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
        axisLabel: { color: '#6b7280' },
      },
      series: [
        {
          type: 'bar',
          data: data.map((item) => item.value),
          barWidth: '50%',
          itemStyle: {
            color: gradientColor,
            borderRadius: [4, 4, 0, 0],
          },
          emphasis: {
            itemStyle: { color: color },
          },
        },
      ],
    };

    chartInstance.current.setOption(option, true);
  }, [data, title, color]);

  return <div ref={chartRef} style={{ width: '100%', height }} />;
};

export default BarChart;
