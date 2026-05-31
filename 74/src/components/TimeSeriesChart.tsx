import React, { useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { SecurityData } from '../../shared/types.js';

interface TimeSeriesChartProps {
  deviceId?: string;
  className?: string;
  title?: string;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ deviceId, className, title = '时序数据分析' }) => {
  const realtimeData = useSecurityStore(state => state.realtimeData);
  const fetchRealtimeData = useSecurityStore(state => state.fetchRealtimeData);
  const selectedTimeRange = useSecurityStore(state => state.selectedTimeRange);

  useEffect(() => {
    fetchRealtimeData();
  }, [fetchRealtimeData, deviceId, selectedTimeRange]);

  const option = useMemo(() => {
    let data = deviceId
      ? realtimeData.filter(d => d.deviceId === deviceId)
      : realtimeData;

    const byDevice = new Map<string, SecurityData[]>();
    data.forEach(d => {
      if (!byDevice.has(d.deviceId)) {
        byDevice.set(d.deviceId, []);
      }
      byDevice.get(d.deviceId)!.push(d);
    });

    const typeColors: Record<string, string> = {
      camera: '#00d4ff',
      access: '#2ed573',
      alarm: '#ff4757'
    };

    const deviceNames = new Map(realtimeData.map(d => [d.deviceId, d.deviceType]));

    const series = Array.from(byDevice.entries()).map(([id, points]) => {
      const sorted = points.sort((a, b) => a.timestamp - b.timestamp).slice(-50);
      const color = typeColors[deviceNames.get(id) || 'camera'];
      return {
        name: id,
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: sorted.map(d => [d.timestamp, d.value]),
        lineStyle: {
          width: 2,
          color: color
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}40` },
              { offset: 1, color: `${color}05` }
            ]
          }
        }
      };
    });

    const statusMarkPoints = data.filter(d => d.status !== 'normal').map(d => ({
      xAxis: d.timestamp,
      yAxis: d.value,
      itemStyle: {
        color: d.status === 'danger' ? '#ff4757' : '#ffa502'
      },
      symbol: 'circle',
      symbolSize: 8
    }));

    return {
      backgroundColor: 'transparent',
      title: {
        text: title,
        textStyle: {
          color: '#00d4ff',
          fontSize: 16,
          fontWeight: 'bold'
        },
        left: 10,
        top: 10
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(10, 22, 40, 0.95)',
        borderColor: '#00d4ff40',
        textStyle: {
          color: '#fff'
        },
        formatter: (params: any) => {
          const time = new Date(params[0].axisValue).toLocaleString('zh-CN');
          let result = `<div style="margin-bottom: 4px">${time}</div>`;
          params.forEach((p: any) => {
            const status = data.find(d => d.timestamp === p.axisValue && d.deviceId === p.seriesName);
            const statusLabel = status?.status === 'danger'
              ? '<span style="color:#ff4757">危险</span>'
              : status?.status === 'warning'
                ? '<span style="color:#ffa502">警告</span>'
                : '<span style="color:#2ed573">正常</span>';
            result += `<div>${p.marker} ${p.seriesName}: ${p.data[1]} ${statusLabel}</div>`;
          });
          return result;
        }
      },
      legend: {
        data: Array.from(byDevice.keys()),
        top: 10,
        right: 10,
        textStyle: {
          color: '#9ca3af'
        }
      },
      grid: {
        left: 60,
        right: 20,
        top: 60,
        bottom: 40
      },
      xAxis: {
        type: 'time',
        axisLine: {
          lineStyle: {
            color: '#374151'
          }
        },
        axisLabel: {
          color: '#9ca3af',
          formatter: (value: number) => {
            return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
          }
        },
        splitLine: {
          lineStyle: {
            color: '#1f2937'
          }
        }
      },
      yAxis: {
        type: 'value',
        axisLine: {
          lineStyle: {
            color: '#374151'
          }
        },
        axisLabel: {
          color: '#9ca3af'
        },
        splitLine: {
          lineStyle: {
            color: '#1f2937'
          }
        }
      },
      series: [
        ...series,
        {
          name: '异常点',
          type: 'scatter',
          data: statusMarkPoints,
          zlevel: 10
        }
      ]
    };
  }, [realtimeData, deviceId, title]);

  return (
    <div className={`w-full h-full ${className || ''}`}>
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};

export default TimeSeriesChart;
