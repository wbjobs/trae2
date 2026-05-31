import React, { useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { formatNumber, formatPercent } from '../utils/format.js';

interface RiskDashboardProps {
  className?: string;
}

export const RiskDashboard: React.FC<RiskDashboardProps> = ({ className }) => {
  const riskOverview = useSecurityStore(state => state.riskOverview);
  const riskTrend = useSecurityStore(state => state.riskTrend);
  const areaRanking = useSecurityStore(state => state.areaRanking);
  const fetchRiskOverview = useSecurityStore(state => state.fetchRiskOverview);
  const fetchRiskTrend = useSecurityStore(state => state.fetchRiskTrend);
  const fetchAreaRanking = useSecurityStore(state => state.fetchAreaRanking);

  useEffect(() => {
    fetchRiskOverview();
    fetchRiskTrend();
    fetchAreaRanking();

    const interval = setInterval(() => {
      fetchRiskOverview();
      fetchRiskTrend();
      fetchAreaRanking();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchRiskOverview, fetchRiskTrend, fetchAreaRanking]);

  const riskColor = (score: number) => {
    if (score >= 70) return '#ff4757';
    if (score >= 40) return '#ffa502';
    return '#2ed573';
  };

  const riskLabel = (score: number) => {
    if (score >= 70) return '高风险';
    if (score >= 40) return '中风险';
    return '低风险';
  };

  const gaugeOption = useMemo(() => {
    const score = riskOverview?.overallRisk || 0;
    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        splitNumber: 10,
        radius: '90%',
        itemStyle: {
          color: riskColor(score)
        },
        progress: {
          show: true,
          width: 20,
          roundCap: true
        },
        pointer: {
          show: false
        },
        axisLine: {
          lineStyle: {
            width: 20,
            color: [
              [0.4, '#2ed573'],
              [0.7, '#ffa502'],
              [1, '#ff4757']
            ]
          }
        },
        axisTick: {
          show: false
        },
        splitLine: {
          show: false
        },
        axisLabel: {
          show: false
        },
        anchor: {
          show: false
        },
        title: {
          show: false
        },
        detail: {
          valueAnimation: true,
          width: '60%',
          lineHeight: 40,
          borderRadius: 8,
          offsetCenter: [0, '0%'],
          fontSize: 48,
          fontWeight: 'bold',
          formatter: '{value}',
          color: riskColor(score)
        },
        data: [{
          value: score
        }]
      }]
    };
  }, [riskOverview]);

  const trendOption = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      title: {
        text: '24小时风险趋势',
        textStyle: {
          color: '#00d4ff',
          fontSize: 14,
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
          const p = params[0];
          return `${p.name}时<br/>风险指数: ${p.value}`;
        }
      },
      grid: {
        left: 40,
        right: 20,
        top: 50,
        bottom: 20
      },
      xAxis: {
        type: 'category',
        data: riskTrend?.map(r => r.hour) || [],
        axisLine: {
          lineStyle: {
            color: '#374151'
          }
        },
        axisLabel: {
          color: '#9ca3af',
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: {
          lineStyle: {
            color: '#374151'
          }
        },
        axisLabel: {
          color: '#9ca3af',
          fontSize: 10
        },
        splitLine: {
          lineStyle: {
            color: '#1f2937'
          }
        }
      },
      series: [{
        type: 'line',
        data: riskTrend?.map(r => r.riskScore) || [],
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2,
          color: '#ff4757'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#ff475740' },
              { offset: 1, color: '#ff475705' }
            ]
          }
        }
      }]
    };
  }, [riskTrend]);

  const rankingOption = useMemo(() => {
    const data = areaRanking?.slice(0, 5) || [];
    return {
      backgroundColor: 'transparent',
      title: {
        text: '区域风险排名',
        textStyle: {
          color: '#00d4ff',
          fontSize: 14,
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
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params: any) => {
          const p = params[0];
          const item = data[p.dataIndex];
          return `${p.name}<br/>风险指数: ${p.value}<br/>告警数: ${item?.alertCount || 0}<br/>异常率: ${item?.anomalyRate ? formatPercent(item.anomalyRate) : '0%'}`;
        }
      },
      grid: {
        left: 100,
        right: 30,
        top: 50,
        bottom: 20
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: {
          lineStyle: {
            color: '#374151'
          }
        },
        axisLabel: {
          color: '#9ca3af',
          fontSize: 10
        },
        splitLine: {
          lineStyle: {
            color: '#1f2937'
          }
        }
      },
      yAxis: {
        type: 'category',
        data: data.map(r => r.area).reverse(),
        axisLine: {
          lineStyle: {
            color: '#374151'
          }
        },
        axisLabel: {
          color: '#9ca3af',
          fontSize: 11
        }
      },
      series: [{
        type: 'bar',
        data: data.map(r => r.riskScore).reverse(),
        itemStyle: {
          color: (params: any) => {
            const value = params.value;
            return riskColor(value);
          },
          borderRadius: [0, 4, 4, 0]
        },
        barWidth: 12
      }]
    };
  }, [areaRanking]);

  return (
    <div className={`h-full ${className || ''}`}>
      <div className="grid grid-cols-12 gap-4 h-full">
        <div className="col-span-3 flex flex-col items-center justify-center p-4 bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="text-sm text-gray-400 mb-2">综合风险指数</div>
          <div className="w-full h-48">
            <ReactECharts
              option={gaugeOption}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
          <div
            className="mt-2 px-4 py-1 rounded-full text-sm font-medium"
            style={{
              backgroundColor: `${riskColor(riskOverview?.overallRisk || 0)}20`,
              color: riskColor(riskOverview?.overallRisk || 0)
            }}
          >
            {riskLabel(riskOverview?.overallRisk || 0)}
          </div>
        </div>

        <div className="col-span-5 bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="h-full">
            <ReactECharts
              option={trendOption}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
        </div>

        <div className="col-span-4 bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="h-full">
            <ReactECharts
              option={rankingOption}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">今日告警总数</div>
          <div className="text-3xl font-bold text-white mt-1">
            {formatNumber(riskOverview?.alertCount || 0)}
          </div>
          <div className="text-xs text-red-400 mt-1">
            ↑ {formatPercent(riskOverview?.alertTrend || 0)} 较昨日
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">设备在线率</div>
          <div className="text-3xl font-bold text-green-400 mt-1">
            {formatPercent(riskOverview?.deviceHealth || 0)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            共 {formatNumber(riskOverview?.totalDevices || 0)} 台设备
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">异常数据率</div>
          <div className="text-3xl font-bold text-orange-400 mt-1">
            {formatPercent(riskOverview?.anomalyRate || 0)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            共处理 {formatNumber(riskOverview?.totalData || 0)} 条数据
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-gray-400">高风险时段</div>
          <div className="text-3xl font-bold text-cyan-400 mt-1">
            {riskOverview?.peakHours?.slice(0, 2).join('、') || '-'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            建议加强巡逻
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskDashboard;
