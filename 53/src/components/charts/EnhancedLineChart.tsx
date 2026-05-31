import React, { useMemo, useRef, useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { AnomalyRange } from '../../types';
import { performanceOptimizer } from '../../modules/performance';

interface EnhancedLineChartProps {
  data: Array<{ time: string; value: number; name?: string }>;
  title?: string;
  yAxisName?: string;
  unit?: string;
  smooth?: boolean;
  areaStyle?: boolean;
  height?: number;
  color?: string;
  showDataZoom?: boolean;
  anomalyRanges?: AnomalyRange[];
  standardValue?: number;
  enableDownsampling?: boolean;
  maxPoints?: number;
}

const EnhancedLineChart: React.FC<EnhancedLineChartProps> = ({
  data,
  title,
  yAxisName,
  unit = '',
  smooth = true,
  areaStyle = false,
  height = 300,
  color = '#0ea5e9',
  showDataZoom = true,
  anomalyRanges = [],
  standardValue,
  enableDownsampling = true,
  maxPoints = 500,
}) => {
  const chartRef = useRef<ReactECharts>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  const processedData = useMemo(() => {
    if (!enableDownsampling || data.length <= maxPoints) {
      return data;
    }
    const optimalPoints = performanceOptimizer.calculateOptimalPoints(containerWidth, 3);
    const targetPoints = Math.min(optimalPoints, maxPoints);
    return performanceOptimizer.downsampleData(data, targetPoints, 'lttb');
  }, [data, enableDownsampling, maxPoints, containerWidth]);

  useEffect(() => {
    const updateWidth = () => {
      if (chartRef.current?.ele) {
        setContainerWidth(chartRef.current.ele.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const option: EChartsOption = useMemo(() => {
    const timeData = processedData.map((d) => d.time);
    const valueData = processedData.map((d) => d.value);

    const markAreas: any[] = [];

    anomalyRanges.forEach((anomaly) => {
      const startIdx = timeData.findIndex((t) => t >= anomaly.startTime);
      const endIdx = timeData.findLastIndex((t) => t <= anomaly.endTime);

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        let areaColor = 'rgba(239, 68, 68, 0.1)';
        if (anomaly.severity === 'medium') {
          areaColor = 'rgba(245, 158, 11, 0.1)';
        } else if (anomaly.severity === 'low') {
          areaColor = 'rgba(16, 185, 129, 0.1)';
        }

        markAreas.push([
          {
            xAxis: startIdx,
            itemStyle: { color: areaColor },
          },
          {
            xAxis: endIdx,
          },
        ]);
      }
    });

    const markLines: any[] = [];

    if (standardValue !== undefined) {
      markLines.push({
        yAxis: standardValue,
        label: {
          formatter: `标准值: {c}${unit}`,
          position: 'end',
          fontSize: 10,
          color: '#6b7280',
        },
        lineStyle: {
          color: '#f59e0b',
          type: 'dashed',
          width: 1,
        },
      });
    }

    return {
      title: title
        ? {
            text: title,
            left: 'center',
            top: 10,
            textStyle: {
              fontSize: 14,
              fontWeight: 'normal',
              color: '#1e3a5f',
            },
          }
        : undefined,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: {
          color: '#374151',
        },
        axisPointer: {
          type: 'cross',
          label: {
            backgroundColor: color,
          },
        },
        formatter: (params: any) => {
          const dataPoint = params[0];
          if (!dataPoint) return '';
          return `
            <div style="padding: 4px 8px;">
              <div style="font-weight: 500; margin-bottom: 4px;">${processedData[dataPoint.dataIndex]?.time || '-'}</div>
              <div>数值: <span style="color: ${color}; font-weight: 600;">${dataPoint.value} ${unit}</span></div>
            </div>
          `;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: showDataZoom ? '18%' : '10%',
        top: title ? '18%' : '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timeData,
        axisLine: {
          lineStyle: {
            color: '#e5e7eb',
          },
        },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          rotate: timeData.length > 15 ? 30 : 0,
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
      dataZoom: showDataZoom
        ? [
            {
              type: 'inside',
              start: 0,
              end: 100,
              throttle: 100,
            },
            {
              type: 'slider',
              start: 0,
              end: 100,
              height: 20,
              bottom: 10,
              borderColor: 'transparent',
              backgroundColor: '#f3f4f6',
              fillerColor: 'rgba(14, 165, 233, 0.2)',
              handleStyle: {
                color: '#0ea5e9',
              },
            },
          ]
        : undefined,
      series: [
        {
          name: '数值',
          type: 'line',
          smooth,
          symbol: 'circle',
          symbolSize: processedData.length < 100 ? 6 : 4,
          showSymbol: processedData.length < 200,
          lineStyle: {
            width: 2,
            color,
          },
          itemStyle: {
            color,
          },
          areaStyle: areaStyle
            ? {
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: color.replace(')', ', 0.3)').replace('rgb', 'rgba') },
                    { offset: 1, color: color.replace(')', ', 0.05)').replace('rgb', 'rgba') },
                  ],
                },
              }
            : undefined,
          data: valueData,
          markArea: markAreas.length > 0 ? { silent: true, data: markAreas } : undefined,
          markLine: markLines.length > 0 ? { silent: true, data: markLines } : undefined,
          large: processedData.length > 500,
          sampling: 'lttb',
        },
      ],
    };
  }, [processedData, title, yAxisName, unit, smooth, areaStyle, color, showDataZoom, anomalyRanges, standardValue]);

  return (
    <ReactECharts
      ref={chartRef}
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
};

export default EnhancedLineChart;
