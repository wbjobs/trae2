import { useState } from 'react';
import type { OpticalElement, LightSource, SimulationResult } from '../types';
import { apiService } from '../services/api';
import SimulationCanvas from '../components/SimulationCanvas';

interface SimulationPageProps {
  elements: OpticalElement[];
  lightSource: LightSource;
  onSimulationComplete: (result: SimulationResult) => void;
}

const simulationTypes = [
  { value: 'ray_tracing', label: '光线追踪', desc: '几何光学光线传播仿真' },
  { value: 'michelson', label: '迈克尔逊干涉', desc: '迈克尔逊干涉仪干涉条纹仿真' },
  { value: 'young', label: '杨氏双缝干涉', desc: '双缝干涉条纹仿真' },
  { value: 'diffraction', label: '衍射计算', desc: '单缝/圆孔衍射图案仿真' },
  { value: 'holography', label: '全息计算', desc: '全息图记录与再现仿真' },
];

function SimulationPage({ elements, lightSource, onSimulationComplete }: SimulationPageProps) {
  const [simulationType, setSimulationType] = useState('ray_tracing');
  const [resolution, setResolution] = useState(500);
  const [enableRecording, setEnableRecording] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const runSimulation = async () => {
    setIsRunning(true);
    setProgress(0);

    try {
      setProgress(20);

      const config = {
        elements,
        light_source: lightSource,
        simulation_type: simulationType,
        resolution,
        enable_recording: simulationType === 'ray_tracing' ? enableRecording : false,
      };

      setProgress(40);

      let simulationResult: SimulationResult;

      if (simulationType === 'ray_tracing') {
        simulationResult = await apiService.simulateRayTracing(config as any);
      } else {
        simulationResult = await apiService.simulateInterference(config as any);
      }

      setProgress(80);

      setResult(simulationResult);
      onSimulationComplete(simulationResult);

      setProgress(100);
    } catch (error) {
      console.error('仿真失败:', error);
    } finally {
      setTimeout(() => {
        setIsRunning(false);
        setProgress(0);
      }, 500);
    }
  };

  return (
    <div>
      <h1 className="page-title">仿真计算</h1>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem' }}>
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">仿真设置</h2>
            </div>

            <div className="form-group">
              <label className="form-label">仿真类型</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {simulationTypes.map((type) => (
                  <div
                    key={type.value}
                    style={{
                      padding: '0.75rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: simulationType === type.value ? 'rgba(26, 86, 219, 0.05)' : 'transparent',
                      borderColor: simulationType === type.value ? 'var(--primary-color)' : 'var(--border-color)',
                    }}
                    onClick={() => setSimulationType(type.value)}
                  >
                    <div style={{ fontWeight: 500 }}>{type.label}</div>
                    <div className="text-small text-muted">{type.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">分辨率</label>
              <select
                className="form-select"
                value={resolution}
                onChange={(e) => setResolution(parseInt(e.target.value))}
              >
                <option value={256}>低 (256)</option>
                <option value={500}>中 (500)</option>
                <option value={1000}>高 (1000)</option>
              </select>
            </div>

            {simulationType === 'ray_tracing' && (
              <div className="form-group">
                <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={enableRecording}
                    onChange={(e) => setEnableRecording(e.target.checked)}
                  />
                  <span>
                    <strong>录制仿真过程</strong>
                    <div className="text-small text-muted">记录光线逐帧传播过程，用于回放分析</div>
                  </span>
                </label>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">元件数量: {elements.length}</label>
              <div className="text-small text-muted">
                当前已配置 {elements.length} 个光学元件
              </div>
            </div>

            {isRunning && (
              <div className="form-group">
                <label className="form-label">计算进度</label>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={runSimulation}
              disabled={isRunning || elements.length === 0}
            >
              {isRunning ? '计算中...' : '开始仿真'}
            </button>
          </div>

          {result && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">快速统计</h2>
              </div>
              <div className="result-grid">
                {result.summary && (
                  <>
                    <div className="result-card">
                      <div className="result-label">总光线数</div>
                      <div className="result-value">{result.summary.total_rays}</div>
                    </div>
                    <div className="result-card">
                      <div className="result-label">接收光线</div>
                      <div className="result-value">{result.summary.rays_reaching_detector}</div>
                    </div>
                  </>
                )}
                {result.contrast !== undefined && (
                  <div className="result-card">
                    <div className="result-label">对比度</div>
                    <div className="result-value">{(result.contrast * 100).toFixed(1)}%</div>
                  </div>
                )}
                {result.visibility !== undefined && (
                  <div className="result-card">
                    <div className="result-label">可见度</div>
                    <div className="result-value">{(result.visibility * 100).toFixed(1)}%</div>
                  </div>
                )}
                {result.performance && (
                  <div className="result-card">
                    <div className="result-label">计算耗时</div>
                    <div className="result-value">{result.performance.total_time.toFixed(2)}s</div>
                  </div>
                )}
                {result.recording?.enabled && (
                  <div className="result-card">
                    <div className="result-label">录制帧数</div>
                    <div className="result-value">{result.recording.frame_count}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">仿真预览</h2>
            </div>
            <SimulationCanvas
              result={result}
              elements={elements}
              simulationType={simulationType}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SimulationPage;
