import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface LineChartProps {
  data: Array<{ time: string; value: number; name?: string }>;
  title?: string;
  yAxisName?: string;
  unit?: string;
  smooth?: boolean;
  areaStyle?: boolean;
  height?: number;
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  title,
  yAxisName,
  unit = '',
  smooth = true,
  areaStyle = false,
  height = 300,
}) => {
  const option: EChartsOption = useMemo(() => {
    const series: EChartsOption['series'] = [{
      name: '数值',
      type: 'line',
      smooth,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 2,
        color: '#0ea5e9',
      },
      itemStyle: {
        color: '#0ea5e9',
      },
      areaStyle: areaStyle ? {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(14, 165, 233, 0.3)' },
            { offset: 1, color: 'rgba(14, 165, 233, 0.05)' },
          ],
        },
      } : undefined,
      data: data.map(d => d.value),
    }];

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
        formatter: (params: any) => {
          const dataPoint = params[0];
          return `
            <div style="padding: 4px 8px;">
              <div style="font-weight: 500; margin-bottom: 4px;">${data[dataPoint.dataIndex]?.time || '-'}</div>
              <div>数值: <span style="color: #0ea5e9; font-weight: 600;">${dataPoint.value} ${unit}</span></div>
            </div>
          `;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        top: title ? '18%' : '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.map(d => d.time),
        axisLine: {
          lineStyle: {
            color: '#e5e7eb',
          },
        },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          rotate: data.length > 15 ? 30 : 0,
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
      series,
    };
  }, [data, title, yAxisName, unit, smooth, areaStyle]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default LineChart;
