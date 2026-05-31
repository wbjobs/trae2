import { useState } from 'react';
import type { OpticalElement, LightSource, BatchConfig, BatchComparisonResult, SimulationResult } from '../types';
import { apiService } from '../services/api';

interface BatchComparisonPageProps {
  elements: OpticalElement[];
  lightSource: LightSource;
}

function BatchComparisonPage({ elements, lightSource }: BatchComparisonPageProps) {
  const [configs, setConfigs] = useState<BatchConfig[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BatchComparisonResult | null>(null);

  const addConfig = () => {
    const newConfig: BatchConfig = {
      id: `config_${configs.length}`,
      name: `方案 ${configs.length + 1}`,
      elements: JSON.parse(JSON.stringify(elements)),
      light_source: { ...lightSource },
      simulation_type: 'ray_tracing',
      resolution: 500,
    };
    setConfigs([...configs, newConfig]);
  };

  const removeConfig = (index: number) => {
    setConfigs(configs.filter((_, i) => i !== index));
  };

  const updateConfigName = (index: number, name: string) => {
    const updated = [...configs];
    updated[index].name = name;
    setConfigs(updated);
  };

  const updateConfigResolution = (index: number, resolution: number) => {
    const updated = [...configs];
    updated[index].resolution = resolution;
    setConfigs(updated);
  };

  const runBatchComparison = async () => {
    if (configs.length < 2) return;

    setIsRunning(true);
    setProgress(0);
    setResult(null);

    try {
      setProgress(10);

      const comparisonConfigs = configs.map((c, i) => ({
        ...c,
        id: c.id || `config_${i}`,
        name: c.name || `方案 ${i + 1}`,
      }));

      setProgress(30);

      const batchResult = await apiService.batchCompare(comparisonConfigs);

      setProgress(90);
      setResult(batchResult);
      setProgress(100);
    } catch (error) {
      console.error('批量比对失败:', error);
    } finally {
      setTimeout(() => {
        setIsRunning(false);
        setProgress(0);
      }, 500);
    }
  };

  const renderConfigCard = (config: BatchConfig, index: number) => (
    <div key={index} className="card" style={{ marginBottom: '1rem' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
        <input
          className="form-input"
          style={{ maxWidth: '200px', fontWeight: 600 }}
          value={config.name}
          onChange={(e) => updateConfigName(index, e.target.value)}
        />
        <button className="icon-btn danger" onClick={() => removeConfig(index)}>
          ✕
        </button>
      </div>
      <div className="grid-2">
        <div>
          <div className="text-small text-muted">元件数量</div>
          <div style={{ fontWeight: 600 }}>{config.elements.length} 个</div>
        </div>
        <div>
          <div className="text-small text-muted">光源波长</div>
          <div style={{ fontWeight: 600 }}>{config.light_source.wavelength} nm</div>
        </div>
        <div>
          <div className="text-small text-muted">仿真类型</div>
          <div style={{ fontWeight: 600 }}>
            {config.simulation_type === 'ray_tracing' ? '光线追踪' : config.simulation_type}
          </div>
        </div>
        <div>
          <div className="text-small text-muted">分辨率</div>
          <select
            className="form-select"
            value={config.resolution}
            onChange={(e) => updateConfigResolution(index, parseInt(e.target.value))}
          >
            <option value={256}>低 (256)</option>
            <option value={500}>中 (500)</option>
            <option value={1000}>高 (1000)</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderResults = () => {
    if (!result) return null;

    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">比对结果</h2>
          <span className="status-badge success">成功 {result.successful}/{result.total_configs}</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={thStyle}>方案名称</th>
                <th style={thStyle}>总光线数</th>
                <th style={thStyle}>接收光线</th>
                <th style={thStyle}>传输效率</th>
                <th style={thStyle}>平均光强</th>
                <th style={thStyle}>状态</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r, i) => {
                const simResult = r.result as SimulationResult;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={tdStyle}>{r.config_name}</td>
                    <td style={tdStyle}>{simResult?.summary?.total_rays || '-'}</td>
                    <td style={tdStyle}>{simResult?.summary?.rays_reaching_detector || '-'}</td>
                    <td style={tdStyle}>
                      {simResult?.summary
                        ? ((simResult.summary.rays_reaching_detector / simResult.summary.total_rays) * 100).toFixed(1) + '%'
                        : '-'}
                    </td>
                    <td style={tdStyle}>{simResult?.summary?.average_intensity?.toFixed(4) || '-'}</td>
                    <td style={tdStyle}>
                      {r.error ? (
                        <span className="status-badge error">失败</span>
                      ) : (
                        <span className="status-badge success">成功</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {result.comparisons.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>方案差异对比</h3>
            <div className="grid-2">
              {result.comparisons.map((comp, i) => (
                <div key={i} className="card" style={{ marginBottom: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
                    {comp.config_a} → {comp.config_b}
                  </div>
                  {comp.metrics.efficiency_diff !== undefined && (
                    <div className="flex justify-between" style={{ marginBottom: '0.25rem' }}>
                      <span className="text-muted">传输效率差异:</span>
                      <span style={{ color: comp.metrics.efficiency_diff > 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                        {comp.metrics.efficiency_diff > 0 ? '+' : ''}{comp.metrics.efficiency_diff} 条光线
                      </span>
                    </div>
                  )}
                  {comp.metrics.intensity_diff !== undefined && (
                    <div className="flex justify-between" style={{ marginBottom: '0.25rem' }}>
                      <span className="text-muted">光强差异:</span>
                      <span>{comp.metrics.intensity_diff > 0 ? '+' : ''}{comp.metrics.intensity_diff.toFixed(4)}</span>
                    </div>
                  )}
                  {comp.metrics.contrast_diff !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted">对比度差异:</span>
                      <span>{(comp.metrics.contrast_diff * 100).toFixed(2)}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
  };

  const tdStyle: React.CSSProperties = {
    padding: '0.75rem',
    fontSize: '0.875rem',
  };

  return (
    <div>
      <h1 className="page-title">批量光路方案比对</h1>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">方案配置</h2>
              <button className="btn btn-primary btn-sm" onClick={addConfig} disabled={elements.length === 0}>
                + 添加方案
              </button>
            </div>

            {configs.length === 0 ? (
              <div className="text-center py-3">
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                <p className="text-muted">请先在元件管理页面配置光学元件</p>
                <p className="text-small text-muted">然后点击「添加方案」创建比对方案</p>
              </div>
            ) : (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {configs.map((config, i) => renderConfigCard(config, i))}
              </div>
            )}

            {isRunning && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">比对进度</label>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={runBatchComparison}
              disabled={isRunning || configs.length < 2}
            >
              {isRunning ? '比对中...' : `开始比对 (${configs.length} 个方案)`}
            </button>
          </div>
        </div>

        <div>
          {!result && (
            <div className="card text-center py-3">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
              <p className="text-muted">添加至少2个方案后运行比对</p>
              <p className="text-small text-muted">比对结果将在此处显示</p>
            </div>
          )}
          {renderResults()}
        </div>
      </div>
    </div>
  );
}

export default BatchComparisonPage;
