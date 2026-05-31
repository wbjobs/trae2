import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface PieChartProps {
  data: { name: string; value: number }[];
  title?: string;
  radius?: string | number[];
  height?: number;
}

const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const PieChart: React.FC<PieChartProps> = ({ data, title, radius = ['40%', '70%'], height = 400 }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const isDonut = Array.isArray(radius) && radius.length === 2;

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

    const total = data.reduce((sum, item) => sum + item.value, 0);

    const option: echarts.EChartsOption = {
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 16, color: '#374151' } } : undefined,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        textStyle: { color: '#374151' },
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        orient: 'vertical',
        left: '5%',
        top: 'middle',
        textStyle: { color: '#6b7280', fontSize: 12 },
        type: 'scroll',
        pageIconColor: '#6b7280',
        pageTextStyle: { color: '#6b7280' },
      },
      color: colors,
      series: [
        {
          type: 'pie',
          radius: radius as any,
          center: ['65%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: '{b}\\n{d}%',
            color: '#374151',
            fontSize: 12,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
            },
          },
          labelLine: {
            show: true,
            length: 15,
            length2: 10,
          },
          data: data.map((item, index) => ({
            name: item.name,
            value: item.value,
            itemStyle: { color: colors[index % colors.length] },
          })),
        },
      ],
      graphic: isDonut ? {
        type: 'text',
        left: '65%',
        top: 'center',
        style: {
          text: `总计\n${total.toLocaleString()}`,
          textAlign: 'center',
          fill: '#374151',
          fontSize: 14,
          fontWeight: 'bold',
        },
      } as any : undefined,
    };

    chartInstance.current.setOption(option, true);
  }, [data, title, radius, isDonut]);

  return <div ref={chartRef} style={{ width: '100%', height }} />;
};

export default PieChart;
