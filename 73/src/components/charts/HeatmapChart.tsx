import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface HeatmapChartProps {
  xData: string[];
  yData: string[];
  data: number[][];
  title?: string;
  height?: number;
}

const HeatmapChart: React.FC<HeatmapChartProps> = ({ xData, yData, data, title, height = 400 }) => {
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

    const heatData: [number, number, number][] = [];
    let maxVal = 0;
    let minVal = 0;

    for (let i = 0; i < yData.length; i++) {
      for (let j = 0; j < xData.length; j++) {
        const val = data[i]?.[j] ?? 0;
        heatData.push([j, i, val]);
        maxVal = Math.max(maxVal, val);
        minVal = Math.min(minVal, val);
      }
    }

    const option: echarts.EChartsOption = {
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 16, color: '#374151' } } : undefined,
      tooltip: {
        position: 'top',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        textStyle: { color: '#374151' },
        formatter: (params: any) => {
          return `${xData[params.value[0]]} - ${yData[params.value[1]]}<br/>值: ${params.value[2]}`;
        },
      },
      grid: {
        left: '3%',
        right: '15%',
        bottom: '20%',
        top: title ? '70px' : '40px',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xData,
        splitArea: { show: true },
        axisLine: { lineStyle: { color: '#d1d5db' } },
        axisLabel: { color: '#6b7280', rotate: 30, interval: 0, fontSize: 10 },
      },
      yAxis: {
        type: 'category',
        data: yData,
        splitArea: { show: true },
        axisLine: { lineStyle: { color: '#d1d5db' } },
        axisLabel: { color: '#6b7280', fontSize: 11 },
      },
      visualMap: {
        min: minVal,
        max: maxVal,
        calculable: true,
        orient: 'vertical',
        right: '2%',
        top: 'middle',
        inRange: {
          color: ['#3b82f6', '#60a5fa', '#93c5fd', '#fcd34d', '#f87171', '#ef4444', '#dc2626'],
        },
        textStyle: { color: '#6b7280', fontSize: 10 },
      },
      series: [
        {
          type: 'heatmap',
          data: heatData,
          label: {
            show: false,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)',
            },
          },
          progressive: 1000,
          animation: true,
        },
      ],
    };

    chartInstance.current.setOption(option, true);
  }, [xData, yData, data, title]);

  return <div ref={chartRef} style={{ width: '100%', height }} />;
};

export default HeatmapChart;
