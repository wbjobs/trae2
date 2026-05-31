import { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { SimulationResult } from '../types';

interface ResultsPageProps {
  result: SimulationResult | null;
}

function ResultsPage({ result }: ResultsPageProps) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!result) {
    return (
      <div>
        <h1 className="page-title">结果分析</h1>
        <div className="card text-center py-3">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
          <p className="text-muted">暂无仿真结果</p>
          <p className="text-small text-muted">请先在「仿真计算」页面运行仿真</p>
        </div>
      </div>
    );
  }

  const getChartOption = () => {
    if (result.intensity && result.x && result.y) {
      const intensityData = result.intensity as number[][];
      const midRow = intensityData[Math.floor(intensityData.length / 2)];
      
      return {
        tooltip: {
          trigger: 'axis',
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: result.x.filter((_, i: number) => i % 10 === 0).map((v: number) => v.toFixed(1)),
          name: '位置 (mm)',
        },
        yAxis: {
          type: 'value',
          name: '光强',
          min: 0,
          max: 1,
        },
        series: [
          {
            name: '光强分布',
            type: 'line',
            smooth: true,
            data: midRow.filter((_, i: number) => i % 10 === 0),
            areaStyle: {
              opacity: 0.3,
            },
            lineStyle: {
              color: '#1a56db',
              width: 2,
            },
            itemStyle: {
              color: '#1a56db',
            },
          },
        ],
      };
    }

    if (result.rays) {
      return {
        tooltip: {
          trigger: 'item',
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true,
        },
        xAxis: {
          type: 'value',
          name: '光线编号',
        },
        yAxis: {
          type: 'value',
          name: '光强',
        },
        series: [
          {
            name: '光线强度',
            type: 'bar',
            data: result.rays.slice(0, 50).map((r, i) => ({
              value: r.intensity,
              itemStyle: {
                color: `hsl(${(i * 360) / 50}, 70%, 60%)`,
              },
            })),
          },
        ],
      };
    }

    return {};
  };

  const get2DHeatmapOption = () => {
    if (!result.intensity || !result.x || !result.y) return {};

    const data: number[][] = [];
    const intensity = result.intensity as number[][];
    const step = Math.max(1, Math.floor(intensity.length / 50));

    for (let i = 0; i < intensity.length; i += step) {
      for (let j = 0; j < intensity[i].length; j += step) {
        data.push([result.x[j], result.y[i], intensity[i][j]]);
      }
    }

    return {
      tooltip: {
        position: 'top',
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
      },
      xAxis: {
        type: 'category',
        data: result.x.filter((_, i: number) => i % step === 0).map((v: number) => v.toFixed(1)),
        splitArea: { show: true },
      },
      yAxis: {
        type: 'category',
        data: result.y.filter((_, i: number) => i % step === 0).map((v: number) => v.toFixed(1)),
        splitArea: { show: true },
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: {
          color: ['#000000', '#1a56db', '#31c2ba', '#f59e0b'],
        },
      },
      series: [
        {
          name: '光强',
          type: 'heatmap',
          data: data.map((d) => [
            result.x.findIndex((v: number) => v === d[0]),
            result.y.findIndex((v: number) => v === d[1]),
            d[2],
          ]),
          label: {
            show: false,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    };
  };

  return (
    <div>
      <h1 className="page-title">结果分析</h1>

      <div className="tabs">
        <div
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          概览
        </div>
        <div
          className={`tab ${activeTab === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          曲线图
        </div>
        <div
          className={`tab ${activeTab === 'heatmap' ? 'active' : ''}`}
          onClick={() => setActiveTab('heatmap')}
        >
          热力图
        </div>
        <div
          className={`tab ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('analysis')}
        >
          详细分析
        </div>
      </div>

      {activeTab === 'overview' && (
        <div>
          <div className="result-grid mb-3">
            <div className="result-card">
              <div className="result-label">仿真类型</div>
              <div className="result-value">{result.type}</div>
            </div>
            {result.summary && (
              <>
                <div className="result-card">
                  <div className="result-label">传输效率</div>
                  <div className="result-value">
                    {(
                      (result.summary.rays_reaching_detector / result.summary.total_rays) *
                      100
                    ).toFixed(1)}
                    %
                  </div>
                </div>
                <div className="result-card">
                  <div className="result-label">接收光线</div>
                  <div className="result-value">{result.summary.rays_reaching_detector}</div>
                </div>
              </>
            )}
            {result.contrast !== undefined && (
              <div className="result-card">
                <div className="result-label">条纹对比度</div>
                <div className="result-value">{(result.contrast * 100).toFixed(1)}%</div>
              </div>
            )}
            {result.visibility !== undefined && (
              <div className="result-card">
                <div className="result-label">条纹可见度</div>
                <div className="result-value">{(result.visibility * 100).toFixed(1)}%</div>
              </div>
            )}
            {result.fringe_spacing !== undefined && (
              <div className="result-card">
                <div className="result-label">条纹间距</div>
                <div className="result-value">{result.fringe_spacing.toFixed(3)} mm</div>
              </div>
            )}
            {result.path_difference !== undefined && (
              <div className="result-card">
                <div className="result-label">光程差</div>
                <div className="result-value">{(result.path_difference * 1e6).toFixed(2)} μm</div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">质量评估</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {result.contrast !== undefined && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span>条纹对比度</span>
                    <span>{(result.contrast * 100).toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${result.contrast * 100}%`,
                        background: result.contrast > 0.8 ? '#10b981' : result.contrast > 0.5 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              )}
              {result.summary && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span>传输效率</span>
                    <span>
                      {(
                        (result.summary.rays_reaching_detector / result.summary.total_rays) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${(result.summary.rays_reaching_detector / result.summary.total_rays) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'chart' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">光强分布曲线</h2>
          </div>
          <div className="chart-container">
            <ReactECharts option={getChartOption()} style={{ height: '100%' }} />
          </div>
        </div>
      )}

      {activeTab === 'heatmap' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">2D 光强热力图</h2>
          </div>
          <div className="chart-container" style={{ height: '500px' }}>
            <ReactECharts option={get2DHeatmapOption()} style={{ height: '100%' }} />
          </div>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">详细分析报告</h2>
            </div>
            <div className="mb-2">
              <h3 style={{ marginBottom: '0.5rem' }}>1. 系统性能评估</h3>
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                {result.contrast !== undefined && result.contrast > 0.8
                  ? '系统干涉条纹对比度优秀，相干性良好，适合进行精密测量。'
                  : result.contrast !== undefined && result.contrast > 0.5
                    ? '系统干涉条纹对比度良好，基本满足测量要求。'
                    : '系统干涉条纹对比度较低，建议检查光源单色性和系统稳定性。'}
              </p>
            </div>
            <div className="mb-2">
              <h3 style={{ marginBottom: '0.5rem' }}>2. 调试建议</h3>
              <ul style={{ paddingLeft: '1.5rem' }}>
                <li className="mb-1">确保所有光学元件安装牢固，避免振动影响</li>
                <li className="mb-1">检查光束准直性，优化光路调整</li>
                <li className="mb-1">定期清洁光学元件表面，保持系统洁净</li>
                <li className="mb-1">使用更高单色性的光源可提高干涉对比度</li>
                <li>考虑增加振动隔离措施</li>
              </ul>
            </div>
            <div>
              <h3 style={{ marginBottom: '0.5rem' }}>3. 测量参数</h3>
              <div className="grid-2">
                {result.intensity && (
                  <div>
                    <strong>最大光强:</strong>{' '}
                    {Math.max(...result.intensity.flat()).toFixed(4)}
                  </div>
                )}
                {result.intensity && (
                  <div>
                    <strong>最小光强:</strong>{' '}
                    {Math.min(...result.intensity.flat()).toFixed(4)}
                  </div>
                )}
                {result.fringe_count !== undefined && (
                  <div>
                    <strong>条纹数量:</strong> {result.fringe_count}
                  </div>
                )}
                {result.fringe_spacing !== undefined && (
                  <div>
                    <strong>平均间距:</strong> {result.fringe_spacing.toFixed(4)} mm
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResultsPage;
