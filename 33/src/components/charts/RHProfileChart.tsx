import React from 'react';
import ReactECharts from 'echarts-for-react';
import { SoundingDataPoint } from '@/types';

interface Props {
  data: SoundingDataPoint[];
  height?: string;
}

export const RHProfileChart: React.FC<Props> = ({ data, height = '500px' }) => {
  const heights = data.map(p => p.height);
  const relativeHumidity = data.map(p => p.relativeHumidity);

  const option = {
    title: {
      text: '相对湿度廓线',
      left: 'center',
      textStyle: { fontSize: 14 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        const param = params[0];
        return `高度: ${param.value[1]} m<br/>${param.marker} 相对湿度: ${param.value[0]}%`;
      }
    },
    grid: {
      left: '10%',
      right: '10%',
      bottom: '10%',
      top: '15%'
    },
    xAxis: {
      type: 'value',
      name: '相对湿度 (%)',
      min: 0,
      max: 100,
      splitLine: { show: true }
    },
    yAxis: {
      type: 'value',
      name: '高度 (m)',
      min: 0,
      max: Math.max(...heights) * 1.1
    },
    series: [
      {
        name: '相对湿度',
        type: 'line',
        data: heights.map((h, i) => [relativeHumidity[i], h]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#13c2c2', width: 2 },
        itemStyle: { color: '#13c2c2' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: 'rgba(19, 194, 194, 0.4)' },
              { offset: 1, color: 'rgba(19, 194, 194, 0.05)' }
            ]
          }
        }
      }
    ]
  };

  return <ReactECharts option={option} style={{ height }} />;
};
