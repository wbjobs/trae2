import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { SoundingData } from '@/types';

interface Props {
  data: SoundingData[];
  field: 'temperature' | 'dewPoint' | 'relativeHumidity' | 'windSpeed';
  height?: string;
}

const FIELD_CONFIG = {
  temperature: { name: '温度', unit: '°C', min: -80, max: 40, colors: ['#ff4d4f', '#ff7a45', '#ffa940', '#ffc53d', '#ffec3d'] },
  dewPoint: { name: '露点', unit: '°C', min: -80, max: 30, colors: ['#1890ff', '#40a9ff', '#69c0ff', '#91d5ff', '#bae7ff'] },
  relativeHumidity: { name: '相对湿度', unit: '%', min: 0, max: 100, colors: ['#13c2c2', '#36cfc9', '#5cdbd3', '#87e8de', '#b5f5ec'] },
  windSpeed: { name: '风速', unit: 'm/s', min: 0, max: 50, colors: ['#52c41a', '#73d13d', '#95de64', '#b7eb8f', '#d9f7be'] }
};

export const MultiStationComparison: React.FC<Props> = ({ data, field, height = '500px' }) => {
  const config = FIELD_CONFIG[field];

  const option = useMemo(() => {
    if (data.length === 0) return {};

    const series = data.map((sounding, index) => {
      const color = config.colors[index % config.colors.length];
      const sortedPoints = [...sounding.dataPoints].sort((a, b) => a.height - b.height);

      return {
        name: sounding.stationName,
        type: 'line',
        data: sortedPoints.map(p => [p[field], p.height]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 3,
        lineStyle: {
          color,
          width: 2,
          type: data.length > 3 ? (index % 2 === 0 ? 'solid' : 'dashed') : 'solid'
        },
        itemStyle: { color },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 4 }
        }
      };
    });

    const allHeights = data.flatMap(d => d.dataPoints.map(p => p.height));
    const maxHeight = Math.max(...allHeights) * 1.1;

    return {
      title: {
        text: `多站点${config.name}廓线对比`,
        left: 'center',
        textStyle: { fontSize: 14 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          const height = params[0]?.value[1];
          let result = `高度: ${height} m<br/>`;
          params.forEach((param: any) => {
            result += `${param.marker} ${param.seriesName}: ${param.value[0]} ${config.unit}<br/>`;
          });
          return result;
        }
      },
      legend: {
        data: data.map(d => d.stationName),
        top: 30,
        type: 'scroll',
        pageIconSize: [10, 10]
      },
      grid: {
        left: '12%',
        right: '8%',
        bottom: '10%',
        top: '18%'
      },
      xAxis: {
        type: 'value',
        name: `${config.name} (${config.unit})`,
        min: config.min,
        max: config.max,
        splitLine: { show: true, lineStyle: { type: 'dashed' } }
      },
      yAxis: {
        type: 'value',
        name: '高度 (m)',
        min: 0,
        max: maxHeight,
        splitLine: { show: true, lineStyle: { type: 'dashed' } }
      },
      series,
      dataZoom: [
        {
          type: 'inside',
          yAxisIndex: 0,
          start: 0,
          end: 100
        }
      ]
    };
  }, [data, field, config]);

  if (data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
        请选择至少一个站点进行对比
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ height }}
      notMerge={true}
      lazyUpdate={true}
      opts={{ renderer: 'canvas' }}
    />
  );
};
