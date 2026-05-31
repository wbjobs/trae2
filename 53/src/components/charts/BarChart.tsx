import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface BarData {
  name: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarData[];
  title?: string;
  xAxisName?: string;
  yAxisName?: string;
  height?: number;
  horizontal?: boolean;
}

const defaultColors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const BarChart: React.FC<BarChartProps> = ({
  data,
  title,
  xAxisName,
  yAxisName,
  height = 300,
  horizontal = false,
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
        trigger: horizontal ? 'axis' : 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: {
          color: '#374151',
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        top: title ? '18%' : '10%',
        containLabel: true,
      },
      xAxis: horizontal ? {
        type: 'value',
        name: xAxisName,
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
      } : {
        type: 'category',
        data: data.map(d => d.name),
        axisLine: {
          lineStyle: {
            color: '#e5e7eb',
          },
        },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          rotate: data.length > 6 ? 30 : 0,
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: horizontal ? {
        type: 'category',
        data: data.map(d => d.name),
        name: yAxisName,
        nameTextStyle: {
          color: '#6b7280',
          fontSize: 11,
        },
        axisLine: {
          lineStyle: {
            color: '#e5e7eb',
          },
        },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
        },
        axisTick: {
          show: false,
        },
      } : {
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
      series: [
        {
          type: 'bar',
          barWidth: '50%',
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
          },
          data: data.map((item, index) => ({
            value: item.value,
            itemStyle: {
              color: item.color || defaultColors[index % defaultColors.length],
            },
          })),
        },
      ],
    };
  }, [data, title, xAxisName, yAxisName, horizontal]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default BarChart;
