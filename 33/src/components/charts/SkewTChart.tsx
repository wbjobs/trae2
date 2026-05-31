import React from 'react';
import ReactECharts from 'echarts-for-react';
import { SoundingDataPoint } from '@/types';

interface Props {
  data: SoundingDataPoint[];
  height?: string;
}

export const SkewTChart: React.FC<Props> = ({ data, height = '600px' }) => {
  const pressures = data.map(p => p.pressure);
  const temperatures = data.map(p => p.temperature);
  const dewPoints = data.map(p => p.dewPoint);

  const option = {
    title: {
      text: '斜温图 (Skew-T)',
      left: 'center',
      textStyle: { fontSize: 14 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        const pressure = params[0]?.value;
        let result = `气压: ${pressure} hPa<br/>`;
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
      splitLine: { show: true, lineStyle: { type: 'dashed' } },
      axisLabel: { rotate: 30 }
    },
    yAxis: {
      type: 'log',
      name: '气压 (hPa)',
      min: 100,
      max: 1050,
      inverse: true,
      splitLine: { show: true, lineStyle: { type: 'dashed' } },
      axisLabel: {
        formatter: (value: number) => value.toString()
      }
    },
    series: [
      {
        name: '温度',
        type: 'line',
        data: pressures.map((p, i) => [temperatures[i], p]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#ff4d4f', width: 2 },
        itemStyle: { color: '#ff4d4f' },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#d9d9d9'
          },
          data: [
            { yAxis: 1000 },
            { yAxis: 850 },
            { yAxis: 700 },
            { yAxis: 500 },
            { yAxis: 300 },
            { yAxis: 200 },
            { yAxis: 100 }
          ]
        }
      },
      {
        name: '露点',
        type: 'line',
        data: pressures.map((p, i) => [dewPoints[i], p]),
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
