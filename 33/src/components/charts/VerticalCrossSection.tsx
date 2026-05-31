import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { SoundingData, SoundingDataPoint } from '@/types';

interface Props {
  data: SoundingData[];
  field: 'temperature' | 'dewPoint' | 'relativeHumidity' | 'windSpeed';
  height?: string;
}

const fieldConfig = {
  temperature: { name: '温度', unit: '°C', min: -60, max: 30, color: 'RdYlBu_r' },
  dewPoint: { name: '露点', unit: '°C', min: -60, max: 25, color: 'Blues' },
  relativeHumidity: { name: '相对湿度', unit: '%', min: 0, max: 100, color: 'YlGnBu' },
  windSpeed: { name: '风速', unit: 'm/s', min: 0, max: 40, color: 'Reds' }
};

const STANDARD_HEIGHTS = [0, 500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000, 18000, 20000];

export const VerticalCrossSection: React.FC<Props> = ({ data, field, height = '500px' }) => {
  const config = fieldConfig[field];

  const { times, heatmapData, minValue, maxValue } = useMemo(() => {
    if (data.length === 0) {
      return { times: [], heatmapData: [], minValue: 0, maxValue: 0 };
    }

    const times = data.map(d => d.soundingTime);
    const heatmapData: (string | number)[][] = [];

    let minVal = Infinity;
    let maxVal = -Infinity;

    data.forEach((sounding, timeIdx) => {
      const points = sounding.dataPoints;

      STANDARD_HEIGHTS.forEach((targetHeight, heightIdx) => {
        const value = interpolateValueAtHeight(points, targetHeight, field);
        if (value !== null) {
          heatmapData.push([times[timeIdx], targetHeight, value]);
          minVal = Math.min(minVal, value);
          maxVal = Math.max(maxVal, value);
        }
      });
    });

    return {
      times,
      heatmapData,
      minValue: isFinite(minVal) ? minVal : config.min,
      maxValue: isFinite(maxVal) ? maxVal : config.max
    };
  }, [data, field, config]);

  if (data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        暂无数据
      </div>
    );
  }

  const option = {
    title: {
      text: `${config.name}垂直剖面图`,
      left: 'center',
      textStyle: { fontSize: 14 }
    },
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        const data = params.data;
        return `时间: ${data[0]}<br/>高度: ${data[1]} m<br/>${config.name}: ${data[2]} ${config.unit}`;
      }
    },
    grid: {
      left: '12%',
      right: '15%',
      bottom: '18%',
      top: '12%'
    },
    xAxis: {
      type: 'category',
      data: times,
      name: '时间',
      nameLocation: 'center',
      nameGap: 35,
      axisLabel: {
        rotate: 45,
        fontSize: 9,
        interval: Math.floor(times.length / 6),
        overflow: 'truncate'
      }
    },
    yAxis: {
      type: 'value',
      name: '高度 (m)',
      nameLocation: 'center',
      nameGap: 35,
      min: 0,
      max: Math.max(...STANDARD_HEIGHTS),
      interval: 2000,
      axisLabel: { fontSize: 10 }
    },
    visualMap: {
      min: Math.floor(minValue),
      max: Math.ceil(maxValue),
      calculable: true,
      orient: 'vertical',
      right: '3%',
      top: 'center',
      itemWidth: 15,
      itemHeight: 180,
      inRange: {
        color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
      }
    },
    series: [
      {
        name: config.name,
        type: 'heatmap',
        data: heatmapData,
        label: { show: false },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  };

  return <ReactECharts option={option} style={{ height }} />;
};

function interpolateValueAtHeight(
  points: SoundingDataPoint[],
  targetHeight: number,
  field: keyof SoundingDataPoint
): number | null {
  if (points.length < 2) return null;

  const sorted = [...points].sort((a, b) => a.height - b.height);

  if (targetHeight < sorted[0].height || targetHeight > sorted[sorted.length - 1].height) {
    return null;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];

    if (targetHeight >= p1.height && targetHeight <= p2.height) {
      if (p2.height === p1.height) {
        const val = p1[field];
        return typeof val === 'number' ? val : null;
      }

      const ratio = (targetHeight - p1.height) / (p2.height - p1.height);
      const v1 = p1[field];
      const v2 = p2[field];

      if (typeof v1 === 'number' && typeof v2 === 'number') {
        return Math.round((v1 + (v2 - v1) * ratio) * 10) / 10;
      }
      return null;
    }
  }

  return null;
}
