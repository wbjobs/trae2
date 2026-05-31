import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { SoundingDataPoint } from '@/types';
import { ChangePoint } from '@/modules/changePointDetection';
import { changePointDetector } from '@/modules/changePointDetection';

interface Props {
  data: SoundingDataPoint[];
  showMarkers?: boolean;
  highlightSignificance?: ('low' | 'medium' | 'high')[];
  height?: string;
}

const significanceColor = {
  low: '#faad14',
  medium: '#fa8c16',
  high: '#ff4d4f'
};

const significanceSize = {
  low: 6,
  medium: 8,
  high: 12
};

export const TemperatureProfileWithMarkers: React.FC<Props> = ({
  data,
  showMarkers = true,
  highlightSignificance = ['high', 'medium'],
  height = '500px'
}) => {
  const { changePoints, option } = useMemo(() => {
    const heights = data.map(p => p.height);
    const temperatures = data.map(p => p.temperature);
    const dewPoints = data.map(p => p.dewPoint);

    const detectedPoints = showMarkers ? changePointDetector.detect(data) : [];

    const markerData: any[] = [];

    if (showMarkers) {
      detectedPoints.forEach(fieldResult => {
        if (fieldResult.field === 'temperature' || fieldResult.field === 'dewPoint') {
          fieldResult.points.forEach(point => {
            if (highlightSignificance.includes(point.significance)) {
              markerData.push({
                coord: [point.value, point.height],
                value: point.value,
                height: point.height,
                significance: point.significance,
                field: fieldResult.fieldName,
                description: point.description,
                change: point.absoluteChange
              });
            }
          });
        }
      });
    }

    const series: any[] = [
      {
        name: '温度',
        type: 'line',
        data: heights.map((h, i) => [temperatures[i], h]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#ff4d4f', width: 2 },
        itemStyle: { color: '#ff4d4f' },
        z: 2
      },
      {
        name: '露点',
        type: 'line',
        data: heights.map((h, i) => [dewPoints[i], h]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#1890ff', width: 2 },
        itemStyle: { color: '#1890ff' },
        z: 2
      }
    ];

    if (markerData.length > 0) {
      series.push({
        name: '突变点',
        type: 'scatter',
        data: markerData.map(d => ({
          value: [d.value, d.height],
          itemStyle: {
            color: significanceColor[d.significance as keyof typeof significanceColor]
          },
          symbolSize: significanceSize[d.significance as keyof typeof significanceSize]
        })),
        tooltip: {
          formatter: (params: any) => {
            const data = params.data;
            return `<strong>${data.field}突变</strong><br/>
                    高度: ${data.height} m<br/>
                    数值: ${data.value} °C<br/>
                    变化量: ${data.change.toFixed(1)} °C<br/>
                    ${data.description}`;
          }
        },
        z: 10
      });
    }

    return {
      changePoints: detectedPoints,
      option: {
        title: {
          text: '温度-露点廓线（含突变点标记）',
          left: 'center',
          textStyle: { fontSize: 14 }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: (params: any) => {
            if (params.data && params.data.seriesName === '突变点') {
              return params.data.description;
            }
            const height = params[0]?.value;
            let result = `高度: ${height} m<br/>`;
            params.forEach((param: any) => {
              if (param.seriesName !== '突变点') {
                result += `${param.marker} ${param.seriesName}: ${param.value[1]} °C<br/>`;
              }
            });
            return result;
          }
        },
        legend: {
          data: ['温度', '露点', '突变点'],
          top: 30
        },
        grid: {
          left: '10%',
          right: '10%',
          bottom: '10%',
          top: '18%'
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
          max: Math.max(...heights) * 1.1
        },
        series
      }
    };
  }, [data, showMarkers, highlightSignificance]);

  return (
    <div>
      <ReactECharts option={option} style={{ height }} notMerge={true} lazyUpdate={true} />
      {showMarkers && changePoints.length > 0 && (
        <div style={{ marginTop: 8, padding: 8, background: '#f9f9f9', borderRadius: 4 }}>
          <span style={{ marginRight: 16 }}>
            检测到 <strong>{changePoints.reduce((sum, f) => sum + f.points.length, 0)}</strong> 个突变点：
          </span>
          {changePoints.map((field, idx) => (
            <span key={idx} style={{ marginRight: 16 }}>
              {field.fieldName}: {field.points.length}个
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
