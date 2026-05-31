import React from 'react';
import ReactECharts from 'echarts-for-react';
import { SoundingDataPoint } from '@/types';

interface Props {
  data: SoundingDataPoint[];
  height?: string;
}

export const WindBarbChart: React.FC<Props> = ({ data, height = '600px' }) => {
  const option = {
    title: {
      text: '风杆图',
      left: 'center',
      textStyle: { fontSize: 14 }
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const param = params[0];
        if (!param) return '';
        const data = param.data;
        return `高度: ${data.height} m<br/>风速: ${data.speed} m/s<br/>风向: ${data.direction}°`;
      }
    },
    grid: {
      left: '15%',
      right: '15%',
      bottom: '10%',
      top: '15%'
    },
    xAxis: {
      type: 'value',
      name: '风速 (m/s)',
      min: -30,
      max: 30,
      splitLine: { show: true, lineStyle: { type: 'dashed' } }
    },
    yAxis: {
      type: 'value',
      name: '高度 (m)',
      min: 0,
      max: Math.max(...data.map(p => p.height)) * 1.1
    },
    series: [
      {
        name: '风杆',
        type: 'custom',
        renderItem: (params: any, api: any) => {
          const data = api.value(0);
          if (!data) return null;
          const x = api.coord([data.uWind, data.height]);
          const speed = data.speed;
          const direction = data.direction;

          const barbLength = Math.min(30, speed * 2);
          const angle = (direction * Math.PI) / 180;

          const endX = x[0] + Math.sin(angle) * barbLength;
          const endY = x[1] - Math.cos(angle) * barbLength;

          const barbs = [];
          let remainingSpeed = speed;
          let barbOffset = 0;

          while (remainingSpeed >= 50) {
            barbs.push({ type: 'triangle', offset: barbOffset });
            remainingSpeed -= 50;
            barbOffset += 8;
          }
          while (remainingSpeed >= 10) {
            barbs.push({ type: 'long', offset: barbOffset });
            remainingSpeed -= 10;
            barbOffset += 6;
          }
          while (remainingSpeed >= 5) {
            barbs.push({ type: 'short', offset: barbOffset });
            remainingSpeed -= 5;
            barbOffset += 4;
          }

          const group: any = {
            type: 'group',
            children: [
              {
                type: 'line',
                shape: {
                  x1: x[0],
                  y1: x[1],
                  x2: endX,
                  y2: endY
                },
                style: {
                  stroke: '#1890ff',
                  lineWidth: 2
                }
              }
            ]
          };

          barbs.forEach((barb, index) => {
            const barbX = x[0] + (Math.sin(angle) * barbLength * (1 - barb.offset / barbLength));
            const barbY = x[1] - (Math.cos(angle) * barbLength * (1 - barb.offset / barbLength));
            const barbAngle = angle + Math.PI / 4;
            const barbSize = barb.type === 'triangle' ? 8 : barb.type === 'long' ? 10 : 5;

            if (barb.type === 'triangle') {
              group.children.push({
                type: 'polygon',
                shape: {
                  points: [
                    [barbX, barbY],
                    [barbX + Math.cos(barbAngle) * barbSize, barbY + Math.sin(barbAngle) * barbSize],
                    [barbX + Math.cos(barbAngle - 0.5) * barbSize * 0.5, barbY + Math.sin(barbAngle - 0.5) * barbSize * 0.5]
                  ]
                },
                style: {
                  fill: '#1890ff'
                }
              });
            } else {
              group.children.push({
                type: 'line',
                shape: {
                  x1: barbX,
                  y1: barbY,
                  x2: barbX + Math.cos(barbAngle) * barbSize,
                  y2: barbY + Math.sin(barbAngle) * barbSize
                },
                style: {
                  stroke: '#1890ff',
                  lineWidth: 2
                }
              });
            }
          });

          return group;
        },
        data: data.map(p => ({
          value: [{
            uWind: p.uWind,
            vWind: p.vWind,
            height: p.height,
            speed: p.windSpeed,
            direction: p.windDirection
          }]
        }))
      },
      {
        name: '风速剖面',
        type: 'line',
        data: data.map(p => [p.windSpeed, p.height]),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#52c41a', width: 1, type: 'dashed' }
      }
    ]
  };

  return <ReactECharts option={option} style={{ height }} />;
};
