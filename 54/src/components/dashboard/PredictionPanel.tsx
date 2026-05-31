import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { TrendingUp, Activity } from 'lucide-react';

interface PredictionData {
  historical: Array<{ timestamp: number; value: number }>;
  predictions: Array<{ timestamp: number; value: number; lower: number; upper: number }>;
  confidence: number;
  trend: 'rising' | 'stable' | 'falling';
}

interface PredictionPanelProps {
  data: {
    temperature: PredictionData;
    humidity: PredictionData;
    co2: PredictionData;
    ch4: PredictionData;
  } | null;
}

const PredictionPanel = ({ data }: PredictionPanelProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || !data) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;
    const tempData = data.temperature;

    const historicalTimes = tempData.historical.map((d) =>
      new Date(d.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
    const historicalValues = tempData.historical.map((d) => d.value);

    const predictionTimes = tempData.predictions.map((d) =>
      new Date(d.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
    const predictionValues = tempData.predictions.map((d) => d.value);
    const lowerValues = tempData.predictions.map((d) => d.lower);
    const upperValues = tempData.predictions.map((d) => d.upper);

    const allTimes = [...historicalTimes, ...predictionTimes];
    const allHistorical = [...historicalValues, ...new Array(predictionValues.length).fill(null)];
    const allPredictions = [
      ...new Array(historicalValues.length - 1).fill(null),
      historicalValues[historicalValues.length - 1],
      ...predictionValues,
    ];
    const allLower = [
      ...new Array(historicalValues.length - 1).fill(null),
      historicalValues[historicalValues.length - 1],
      ...lowerValues,
    ];
    const allUpper = [
      ...new Array(historicalValues.length - 1).fill(null),
      historicalValues[historicalValues.length - 1],
      ...upperValues,
    ];

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(10, 22, 40, 0.9)',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        textStyle: { color: '#fff' },
      },
      legend: {
        data: ['历史数据', '预测值', '置信区间'],
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
        data: allTimes,
        axisLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.3)' } },
        axisLabel: { color: '#8aa4c4', fontSize: 10, rotate: 45 },
      },
      yAxis: {
        type: 'value',
        name: '温度 (°C)',
        axisLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.3)' } },
        axisLabel: { color: '#8aa4c4', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.1)' } },
      },
      series: [
        {
          name: '历史数据',
          type: 'line',
          data: allHistorical,
          smooth: true,
          lineStyle: { color: '#00d4ff', width: 2 },
          itemStyle: { color: '#00d4ff' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
              { offset: 1, color: 'rgba(0, 212, 255, 0)' },
            ]),
          },
          symbol: 'none',
        },
        {
          name: '预测值',
          type: 'line',
          data: allPredictions,
          smooth: true,
          lineStyle: { color: '#ff6b35', width: 2, type: 'dashed' },
          itemStyle: { color: '#ff6b35' },
          symbol: 'circle',
          symbolSize: 6,
        },
        {
          name: '置信区间',
          type: 'line',
          data: allUpper,
          lineStyle: { opacity: 0 },
          symbol: 'none',
          stack: 'confidence',
        },
        {
          name: '置信区间',
          type: 'line',
          data: allLower.map((val, idx) => {
            if (val === null || allUpper[idx] === null) return null;
            return allUpper[idx]! - val;
          }),
          lineStyle: { opacity: 0 },
          symbol: 'none',
          stack: 'confidence',
          areaStyle: {
            color: 'rgba(255, 107, 53, 0.2)',
          },
          legendHoverLink: false,
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'rising':
        return '↑';
      case 'falling':
        return '↓';
      default:
        return '→';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'rising':
        return '#ff6b35';
      case 'falling':
        return '#4caf50';
      default:
        return '#00d4ff';
    }
  };

  return (
    <div className="bg-gradient-to-br from-[#0d1f3c]/80 to-[#0a1628]/80 rounded-xl border border-[#00d4ff]/20 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#00d4ff]" />
          <h3 className="text-white font-semibold">运行态势短期预测</h3>
        </div>
        {data && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#8aa4c4]">置信度:</span>
              <span className="text-[#00d4ff] font-mono font-bold">
                {(data.temperature.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#8aa4c4]">趋势:</span>
              <span
                className="font-mono font-bold text-lg"
                style={{ color: getTrendColor(data.temperature.trend) }}
              >
                {getTrendIcon(data.temperature.trend)}
              </span>
            </div>
          </div>
        )}
      </div>

      {data && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {(['temperature', 'humidity', 'co2', 'ch4'] as const).map((key) => {
            const pred = data[key];
            const labels: Record<string, string> = {
              temperature: '温度',
              humidity: '湿度',
              co2: 'CO₂',
              ch4: 'CH₄',
            };
            const units: Record<string, string> = {
              temperature: '°C',
              humidity: '%',
              co2: 'ppm',
              ch4: '%LEL',
            };
            const lastPred = pred.predictions[pred.predictions.length - 1];
            return (
              <div
                key={key}
                className="p-2 bg-[#0a1628]/50 rounded-lg text-center"
              >
                <div className="text-xs text-[#8aa4c4] mb-1">{labels[key]}</div>
                <div
                  className="text-lg font-mono font-bold"
                  style={{ color: getTrendColor(pred.trend) }}
                >
                  {lastPred ? lastPred.value.toFixed(key === 'ch4' ? 2 : 1) : '-'}
                  <span className="text-xs text-[#5a7a9a] ml-1">{units[key]}</span>
                </div>
                <div
                  className="text-xs font-mono"
                  style={{ color: getTrendColor(pred.trend) }}
                >
                  {getTrendIcon(pred.trend)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div ref={chartRef} className="flex-1 min-h-[150px]" />
    </div>
  );
};

export default PredictionPanel;
