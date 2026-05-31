import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface ScatterChartProps {
  xData: number[];
  yData: number[];
  xName?: string;
  yName?: string;
  title?: string;
  height?: number;
}

const ScatterChart: React.FC<ScatterChartProps> = ({ xData, yData, xName, yName, title, height = 400 }) => {
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

    const n = xData.length;
    const sumX = xData.reduce((a, b) => a + b, 0);
    const sumY = yData.reduce((a, b) => a + b, 0);
    const sumXY = xData.reduce((sum, x, i) => sum + x * yData[i], 0);
    const sumX2 = xData.reduce((a, b) => a + b * b, 0);
    const sumY2 = yData.reduce((a, b) => a + b * b, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const correlation = denominator !== 0 ? numerator / denominator : 0;

    const minX = Math.min(...xData);
    const maxX = Math.max(...xData);
    const lineData = [
      [minX, slope * minX + intercept],
      [maxX, slope * maxX + intercept],
    ];

    const option: echarts.EChartsOption = {
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 16, color: '#374151' } } : undefined,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        textStyle: { color: '#374151' },
        formatter: (params: any) => {
          if (params.seriesType === 'scatter') {
            return `${xName || 'X'}: ${params.value[0]}<br/>${yName || 'Y'}: ${params.value[1]}`;
          }
          return '';
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: title ? '70px' : '40px',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: xName,
        nameTextStyle: { color: '#6b7280' },
        axisLine: { lineStyle: { color: '#d1d5db' } },
        axisLabel: { color: '#6b7280' },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      yAxis: {
        type: 'value',
        name: yName,
        nameTextStyle: { color: '#6b7280' },
        axisLine: { lineStyle: { color: '#d1d5db' } },
        axisLabel: { color: '#6b7280' },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      series: [
        {
          name: '散点',
          type: 'scatter',
          data: xData.map((x, i) => [x, yData[i]]),
          symbolSize: 10,
          itemStyle: {
            color: 'rgba(59, 130, 246, 0.7)',
            borderColor: '#3b82f6',
            borderWidth: 1,
          },
          emphasis: {
            itemStyle: {
              color: 'rgba(59, 130, 246, 1)',
            },
          },
        },
        {
          name: '趋势线',
          type: 'line',
          data: lineData,
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: '#ef4444',
            width: 2,
            type: 'dashed',
          },
        },
      ],
      graphic: {
        type: 'text',
        right: 20,
        top: title ? 60 : 30,
        style: {
          text: `相关系数: ${correlation.toFixed(4)}`,
          fill: '#374151',
          fontSize: 12,
          fontWeight: 'bold',
        },
      } as any,
    };

    chartInstance.current.setOption(option, true);
  }, [xData, yData, xName, yName, title]);

  return <div ref={chartRef} style={{ width: '100%', height }} />;
};

export default ScatterChart;
