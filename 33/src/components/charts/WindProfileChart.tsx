import React from 'react';
import ReactECharts from 'echarts-for-react';
import { SoundingDataPoint } from '@/types';

interface Props {
  data: SoundingDataPoint[];
  height?: string;
}

export const WindProfileChart: React.FC<Props> = ({ data, height = '500px' }) => {
  const heights = data.map(p => p.height);
  const windSpeeds = data.map(p => p.windSpeed);
  const windDirections = data.map(p => p.windDirection);

  const option = {
    title: {
      text: '风廓线',
      left: 'center',
      textStyle: { fontSize: 14 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        const height = params[0]?.value;
        let result = `高度: ${height} m<br/>`;
        params.forEach((param: any) => {
          const unit = param.seriesName.includes('风速') ? ' m/s' : '°';
          result += `${param.marker} ${param.seriesName}: ${param.value[1]}${unit}<br/>`;
        });
        return result;
      }
    },
    legend: {
      data: ['风速', '风向'],
      top: 30
    },
    grid: {
      left: '10%',
      right: '10%',
      bottom: '10%',
      top: '15%'
    },
    xAxis: [
      {
        type: 'value',
        name: '风速 (m/s)',
        position: 'bottom',
        min: 0,
        max: Math.max(...windSpeeds) * 1.1,
        axisLine: { lineStyle: { color: '#52c41a' } },
        axisLabel: { color: '#52c41a' }
      },
      {
        type: 'value',
        name: '风向 (°)',
        position: 'top',
        min: 0,
        max: 360,
        axisLine: { lineStyle: { color: '#722ed1' } },
        axisLabel: { color: '#722ed1' }
      }
    ],
    yAxis: {
      type: 'value',
      name: '高度 (m)',
      min: 0,
      max: Math.max(...heights) * 1.1
    },
    series: [
      {
        name: '风速',
        type: 'line',
        xAxisIndex: 0,
        data: heights.map((h, i) => [windSpeeds[i], h]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#52c41a', width: 2 },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
            ]
          }
        }
      },
      {
        name: '风向',
        type: 'line',
        xAxisIndex: 1,
        data: heights.map((h, i) => [windDirections[i], h]),
        smooth: true,
        symbol: 'diamond',
        symbolSize: 4,
        lineStyle: { color: '#722ed1', width: 2 },
        itemStyle: { color: '#722ed1' }
      }
    ]
  };

  return <ReactECharts option={option} style={{ height }} />;
};
