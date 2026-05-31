import React from 'react';
import ReactECharts from 'echarts-for-react';
import { SoundingDataPoint } from '@/types';

interface Props {
  data: SoundingDataPoint[];
  height?: string;
}

export const TemperatureProfileChart: React.FC<Props> = ({ data, height = '500px' }) => {
  const heights = data.map(p => p.height);
  const temperatures = data.map(p => p.temperature);
  const dewPoints = data.map(p => p.dewPoint);

  const option = {
    title: {
      text: '温度-露点廓线',
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
          result += `${param.marker} ${param.seriesName}: ${param.value[1]} °C<br/>`;
        });
        return result;
      }
    },
    legend: {
      data: ['温度', '露点'],
      top: 30
    },
    grid: {
      left: '10%',
      right: '10%',
      bottom: '10%',
      top: '15%'
    },
    xAxis: {
      type: 'value',
      name: '温度 (°C)',
      min: -80,
      max: 40,
      splitLine: { show: true }
    },
    yAxis: {
      type: 'value',
      name: '高度 (m)',
      min: 0,
      max: Math.max(...heights) * 1.1,
      inverse: false
    },
    series: [
      {
        name: '温度',
        type: 'line',
        data: heights.map((h, i) => [temperatures[i], h]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#ff4d4f', width: 2 },
        itemStyle: { color: '#ff4d4f' }
      },
      {
        name: '露点',
        type: 'line',
        data: heights.map((h, i) => [dewPoints[i], h]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#1890ff', width: 2 },
        itemStyle: { color: '#1890ff' }
      }
    ]
  };

  return <ReactECharts option={option} style={{ height }} />;
};
