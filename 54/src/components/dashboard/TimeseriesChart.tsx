import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useDashboardStore } from '../../store/dashboardStore';
import { TrendingUp } from 'lucide-react';

const TimeseriesChart = () => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const { timeseries } = useDashboardStore();

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;

    const timestamps = timeseries.map((d) =>
      new Date(d.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    );

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(10, 22, 40, 0.9)',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        textStyle: { color: '#fff' },
        axisPointer: {
          type: 'cross',
          lineStyle: { color: 'rgba(0, 212, 255, 0.3)' },
        },
      },
      legend: {
        data: ['温度', '湿度', 'CO₂', 'CH₄'],
        textStyle: { color: '#8aa4c4' },
        top: 0,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timestamps,
        axisLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.3)' } },
        axisLabel: { color: '#8aa4c4', fontSize: 10 },
      },
      yAxis: [
        {
          type: 'value',
          name: '温度/湿度',
          position: 'left',
          axisLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.3)' } },
          axisLabel: { color: '#8aa4c4', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.1)' } },
        },
        {
          type: 'value',
          name: '浓度',
          position: 'right',
          axisLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.3)' } },
          axisLabel: { color: '#8aa4c4', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '温度',
          type: 'line',
          smooth: true,
          data: timeseries.map((d) => d.temperature),
          lineStyle: { color: '#ff6b35', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(255, 107, 53, 0.3)' },
              { offset: 1, color: 'rgba(255, 107, 53, 0)' },
            ]),
          },
          symbol: 'none',
          yAxisIndex: 0,
        },
        {
          name: '湿度',
          type: 'line',
          smooth: true,
          data: timeseries.map((d) => d.humidity),
          lineStyle: { color: '#00d4ff', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
              { offset: 1, color: 'rgba(0, 212, 255, 0)' },
            ]),
          },
          symbol: 'none',
          yAxisIndex: 0,
        },
        {
          name: 'CO₂',
          type: 'line',
          smooth: true,
          data: timeseries.map((d) => d.co2),
          lineStyle: { color: '#9c27b0', width: 2 },
          symbol: 'none',
          yAxisIndex: 1,
        },
        {
          name: 'CH₄',
          type: 'line',
          smooth: true,
          data: timeseries.map((d) => d.ch4 * 100),
          lineStyle: { color: '#ff3366', width: 2 },
          symbol: 'none',
          yAxisIndex: 1,
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [timeseries]);

  return (
    <div className="bg-gradient-to-br from-[#0d1f3c]/80 to-[#0a1628]/80 rounded-xl border border-[#00d4ff]/20 p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-[#00d4ff]" />
        <h3 className="text-white font-semibold">时序数据趋势分析</h3>
      </div>
      <div ref={chartRef} className="flex-1 min-h-[200px]" />
    </div>
  );
};

export default TimeseriesChart;
