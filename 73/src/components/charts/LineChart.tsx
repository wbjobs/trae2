import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface LineChartProps {
  xData: string[];
  series: { name: string; data: number[] }[];
  title?: string;
  height?: number;
}

const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const LineChart: React.FC<LineChartProps> = ({ xData, series, title, height = 400 }) => {
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
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        textStyle: { color: '#374151' },
      },
      legend: {
        data: series.map((s) => s.name),
        top: title ? '45px' : '15px',
        textStyle: { color: '#6b7280', fontSize: 12 },
        type: 'scroll',
        pageIconColor: '#6b7280',
        pageTextStyle: { color: '#6b7280' },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '70px',
        top: title ? '90px' : '60px',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xData,
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
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
          height: 20,
          bottom: 10,
          borderColor: 'transparent',
          backgroundColor: '#f3f4f6',
          fillerColor: 'rgba(59, 130, 246, 0.2)',
          handleStyle: { color: '#3b82f6' },
          textStyle: { color: '#6b7280' },
        },
      ],
      series: series.map((s, index) => {
        const color = colors[index % colors.length];
        const gradientColor = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: `${color}80` },
          { offset: 1, color: `${color}10` },
        ]);

        return {
          name: s.name,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: s.data,
          itemStyle: { color },
          lineStyle: { width: 2, color },
          areaStyle: { color: gradientColor },
          emphasis: {
            focus: 'series',
            itemStyle: { borderWidth: 2, borderColor: '#fff' },
          },
        };
      }),
    };

    chartInstance.current.setOption(option, true);
  }, [xData, series, title]);

  return <div ref={chartRef} style={{ width: '100%', height }} />;
};

export default LineChart;
