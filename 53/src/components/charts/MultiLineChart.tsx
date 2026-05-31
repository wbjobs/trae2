import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface SeriesData {
  name: string;
  data: number[];
  color?: string;
}

interface MultiLineChartProps {
  xAxisData: string[];
  series: SeriesData[];
  title?: string;
  yAxisName?: string;
  unit?: string;
  height?: number;
  legendPosition?: 'top' | 'bottom';
}

const defaultColors = [
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

const MultiLineChart: React.FC<MultiLineChartProps> = ({
  xAxisData,
  series,
  title,
  yAxisName,
  unit = '',
  height = 300,
  legendPosition = 'top',
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
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: {
          color: '#374151',
        },
      },
      legend: {
        show: series.length > 1,
        [legendPosition === 'top' ? 'top' : 'bottom']: legendPosition === 'top' ? (title ? 40 : 10) : 10,
        left: 'center',
        itemWidth: 12,
        itemHeight: 8,
        textStyle: {
          fontSize: 11,
          color: '#6b7280',
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: legendPosition === 'bottom' && series.length > 1 ? '15%' : '10%',
        top: title ? '18%' : (legendPosition === 'top' && series.length > 1 ? '15%' : '10%'),
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xAxisData,
        axisLine: {
          lineStyle: {
            color: '#e5e7eb',
          },
        },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          rotate: xAxisData.length > 15 ? 30 : 0,
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        name: yAxisName,
        nameTextStyle: {
          color: '#6b7280',
          fontSize: 11,
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
        },
        splitLine: {
          lineStyle: {
            color: '#f3f4f6',
            type: 'dashed',
          },
        },
      },
      series: series.map((s, index) => ({
        name: s.name,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          width: 2,
          color: s.color || defaultColors[index % defaultColors.length],
        },
        itemStyle: {
          color: s.color || defaultColors[index % defaultColors.length],
        },
        data: s.data,
      })),
    };
  }, [xAxisData, series, title, yAxisName, legendPosition]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default MultiLineChart;
