import { useState } from 'react';
import type { SimulationResult, OpticalElement } from '../types';
import { apiService } from '../services/api';

interface ReportPageProps {
  simulationResult: SimulationResult | null;
  elements: OpticalElement[];
}

function ReportPage({ simulationResult, elements }: ReportPageProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportSettings, setReportSettings] = useState({
    includeCharts: true,
    includeRawData: false,
    includeRecommendations: true,
    reportTitle: '光路仿真调试报告',
  });

  const generateReport = async () => {
    if (!simulationResult) return;

    setIsGenerating(true);
    try {
      const blob = await apiService.generateReport(simulationResult, elements);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '光路仿真调试报告.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('报告生成失败:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">报告生成</h1>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem' }}>
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">报告预览</h2>
            </div>
            
            <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '0.5rem' }}>
              <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>
                {reportSettings.reportTitle}
              </h3>
              <div style={{ borderTop: '2px solid var(--primary-color)', marginBottom: '1rem' }} />
              
              <div className="mb-2">
                <h4 style={{ marginBottom: '0.5rem' }}>一、系统概述</h4>
                <p className="text-small text-muted">
                  本报告包含光学系统仿真分析结果，系统共配置 {elements.length} 个光学元件。
                </p>
              </div>

              {simulationResult && (
                <>
                  <div className="mb-2">
                    <h4 style={{ marginBottom: '0.5rem' }}>二、仿真结果</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                      {simulationResult.contrast !== undefined && (
                        <div style={{ padding: '0.5rem', background: 'white', borderRadius: '0.25rem' }}>
                          <div className="text-small text-muted">条纹对比度</div>
                          <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                            {(simulationResult.contrast * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}
                      {simulationResult.visibility !== undefined && (
                        <div style={{ padding: '0.5rem', background: 'white', borderRadius: '0.25rem' }}>
                          <div className="text-small text-muted">可见度</div>
                          <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                            {(simulationResult.visibility * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}
                      {simulationResult.summary && (
                        <>
                          <div style={{ padding: '0.5rem', background: 'white', borderRadius: '0.25rem' }}>
                            <div className="text-small text-muted">传输效率</div>
                            <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                              {(
                                (simulationResult.summary.rays_reaching_detector /
                                  simulationResult.summary.total_rays) *
                                100
                              ).toFixed(1)}
                              %
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {reportSettings.includeRecommendations && (
                    <div className="mb-2">
                      <h4 style={{ marginBottom: '0.5rem' }}>三、调试建议</h4>
                      <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
                        <li className="mb-1">检查并优化光路准直性</li>
                        <li className="mb-1">确保光学元件表面清洁</li>
                        <li className="mb-1">验证系统振动隔离措施</li>
                        <li>定期进行系统校准</li>
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {!simulationResult && (
            <div className="card text-center py-3">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
              <p className="text-muted">暂无仿真数据</p>
              <p className="text-small text-muted">请先运行仿真以生成报告</p>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">报告设置</h2>
            </div>

            <div className="form-group">
              <label className="form-label">报告标题</label>
              <input
                type="text"
                className="form-input"
                value={reportSettings.reportTitle}
                onChange={(e) =>
                  setReportSettings({ ...reportSettings, reportTitle: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <input
                  type="checkbox"
                  checked={reportSettings.includeCharts}
                  onChange={(e) =>
                    setReportSettings({ ...reportSettings, includeCharts: e.target.checked })
                  }
                  style={{ marginRight: '0.5rem' }}
                />
                包含图表
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">
                <input
                  type="checkbox"
                  checked={reportSettings.includeRecommendations}
                  onChange={(e) =>
                    setReportSettings({
                      ...reportSettings,
                      includeRecommendations: e.target.checked,
                    })
                  }
                  style={{ marginRight: '0.5rem' }}
                />
                包含调试建议
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">
                <input
                  type="checkbox"
                  checked={reportSettings.includeRawData}
                  onChange={(e) =>
                    setReportSettings({ ...reportSettings, includeRawData: e.target.checked })
                  }
                  style={{ marginRight: '0.5rem' }}
                />
                包含原始数据
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">元件数量: {elements.length}</label>
              <div className="text-small text-muted">
                {elements.length > 0
                  ? `已配置 ${elements.length} 个光学元件`
                  : '未配置任何元件'}
              </div>
            </div>

            <button
              className="btn btn-success"
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={generateReport}
              disabled={!simulationResult || isGenerating}
            >
              {isGenerating ? '生成中...' : '生成 PDF 报告'}
            </button>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">快速导出</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                disabled={!simulationResult}
                onClick={() => {
                  const data = JSON.stringify(simulationResult, null, 2);
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'simulation_results.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                导出 JSON 数据
              </button>
              <button
                className="btn btn-secondary"
                disabled={elements.length === 0}
                onClick={() => {
                  const data = JSON.stringify(elements, null, 2);
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'optical_elements.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                导出元件配置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportPage;
