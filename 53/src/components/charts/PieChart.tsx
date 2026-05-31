import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface PieData {
  name: string;
  value: number;
  color?: string;
}

interface PieChartProps {
  data: PieData[];
  title?: string;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
}

const defaultColors = ['#10b981', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'];

const PieChart: React.FC<PieChartProps> = ({
  data,
  title,
  height = 280,
  innerRadius = 0,
  outerRadius = '65%',
  showLegend = true,
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
        formatter: '{b}: {c} ({d}%)',
      },
      legend: showLegend ? {
        bottom: 10,
        left: 'center',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: {
          fontSize: 11,
          color: '#6b7280',
        },
      } : undefined,
      series: [
        {
          type: 'pie',
          radius: [innerRadius, outerRadius],
          center: ['50%', showLegend ? '45%' : '50%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: true,
            fontSize: 11,
            color: '#374151',
            formatter: '{b}\n{d}%',
          },
          labelLine: {
            show: true,
            length: 10,
            length2: 8,
          },
          data: data.map((item, index) => ({
            ...item,
            itemStyle: {
              color: item.color || defaultColors[index % defaultColors.length],
            },
          })),
        },
      ],
    };
  }, [data, title, innerRadius, outerRadius, showLegend]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default PieChart;
