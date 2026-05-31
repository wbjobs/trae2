import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimulationResult, FrameData } from '../types';

interface PlaybackPageProps {
  simulationResult: SimulationResult | null;
}

function PlaybackPage({ simulationResult }: PlaybackPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const animationRef = useRef<number | null>(null);

  const frames = simulationResult?.recording?.frames || [];
  const totalFrames = frames.length;

  const drawFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const scale = 3;
    const offsetX = 50;
    const offsetY = height / 2;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const frame = frames[frameIndex];
    if (!frame || !frame.rays) return;

    frame.rays.forEach((ray, rayIndex) => {
      if (!ray.path || ray.path.length < 2) return;

      const hue = (rayIndex * 360) / Math.max(frame.rays.length, 1);
      ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${0.3 + (ray.intensity || 0.5) * 2})`;
      ctx.lineWidth = 1 + (ray.intensity || 0.5) * 2;

      ctx.beginPath();
      const startX = offsetX + (ray.path[0][0] || 0) * scale;
      const startY = offsetY + (ray.path[0][1] || 0) * scale;
      ctx.moveTo(startX, startY);

      for (let i = 1; i < ray.path.length; i++) {
        const px = offsetX + (ray.path[i][0] || 0) * scale;
        const py = offsetY + (ray.path[i][1] || 0) * scale;
        ctx.lineTo(px, py);
      }

      ctx.stroke();

      if (ray.path.length > 0) {
        const lastPoint = ray.path[ray.path.length - 1];
        const endX = offsetX + (lastPoint[0] || 0) * scale;
        const endY = offsetY + (lastPoint[1] || 0) * scale;

        ctx.fillStyle = `hsla(${hue}, 70%, 70%, 0.9)`;
        ctx.beginPath();
        ctx.arc(endX, endY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`帧: ${frame.frame_index}/${totalFrames - 1}`, 10, 20);
    ctx.fillText(`时间: ${frame.timestamp.toFixed(3)}s`, 10, 38);
    ctx.fillText(`事件: ${frame.event_type || '-'}`, 10, 56);
    ctx.fillText(`元件: ${frame.element_id || '-'}`, 10, 74);

    if (frame.description) {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(frame.description, 10, height - 20);
    }
  }, [frames, totalFrames]);

  useEffect(() => {
    drawFrame(currentFrame);
  }, [currentFrame, drawFrame]);

  useEffect(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
  }, [simulationResult]);

  useEffect(() => {
    if (!isPlaying || frames.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = () => {
      setCurrentFrame((prev) => {
        const next = prev + 1;
        if (next >= frames.length) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
      animationRef.current = window.setTimeout(animate, 100 / playSpeed) as unknown as number;
    };

    animationRef.current = window.setTimeout(animate, 100 / playSpeed) as unknown as number;

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [isPlaying, frames, playSpeed]);

  const handlePlayPause = () => {
    if (frames.length === 0) return;
    if (currentFrame >= frames.length - 1) {
      setCurrentFrame(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleFrameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setCurrentFrame(parseInt(e.target.value));
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaySpeed(parseInt(e.target.value));
  };

  const handlePrevFrame = () => {
    setIsPlaying(false);
    setCurrentFrame((prev) => Math.max(0, prev - 1));
  };

  const handleNextFrame = () => {
    setIsPlaying(false);
    setCurrentFrame((prev) => Math.min(frames.length - 1, prev + 1));
  };

  if (!simulationResult?.recording?.enabled || frames.length === 0) {
    return (
      <div>
        <h1 className="page-title">仿真过程回放</h1>
        <div className="card text-center py-3">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎬</div>
          <p className="text-muted">暂无可回放的仿真数据</p>
          <p className="text-small text-muted">请在「仿真计算」页面开启「录制仿真过程」后运行仿真</p>
        </div>
      </div>
    );
  }

  const currentFrameData: FrameData | undefined = frames[currentFrame];

  return (
    <div>
      <h1 className="page-title">仿真过程回放</h1>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">回放播放器</h2>
          <div className="flex items-center gap-2">
            <span className="status-badge info">共 {totalFrames} 帧</span>
            {simulationResult.performance && (
              <span className="status-badge success">
                耗时 {simulationResult.performance.total_time.toFixed(2)}s
              </span>
            )}
          </div>
        </div>

        <div style={{ background: '#0f172a', borderRadius: '0.5rem', overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={450}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: '0.5rem' }}>
          <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
            <button className="btn btn-secondary" onClick={handlePrevFrame} disabled={currentFrame === 0}>
              ⏮
            </button>
            <button className="btn btn-primary" onClick={handlePlayPause}>
              {isPlaying ? '⏸ 暂停' : '▶ 播放'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleNextFrame}
              disabled={currentFrame >= frames.length - 1}
            >
              ⏭
            </button>
            <div style={{ flex: 1 }} />
            <label className="flex items-center gap-1 text-small text-muted">
              速度:
              <select value={playSpeed} onChange={handleSpeedChange} className="form-select" style={{ width: '80px' }}>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
                <option value={8}>8x</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-small text-muted" style={{ minWidth: '40px' }}>0</span>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={currentFrame}
              onChange={handleFrameChange}
              style={{ flex: 1 }}
            />
            <span className="text-small text-muted" style={{ minWidth: '60px', textAlign: 'right' }}>
              {currentFrame}/{frames.length - 1}
            </span>
          </div>
        </div>

        {currentFrameData && (
          <div style={{ marginTop: '1rem' }}>
            <div className="grid-2">
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="text-small text-muted" style={{ marginBottom: '0.5rem' }}>当前帧信息</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>帧序号:</strong> {currentFrameData.frame_index}</div>
                  <div><strong>时间戳:</strong> {currentFrameData.timestamp.toFixed(4)}s</div>
                  <div><strong>事件类型:</strong> {currentFrameData.event_type || '-'}</div>
                  <div><strong>关联元件:</strong> {currentFrameData.element_id || '-'}</div>
                </div>
              </div>
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="text-small text-muted" style={{ marginBottom: '0.5rem' }}>事件描述</div>
                <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                  {currentFrameData.description || '无描述信息'}
                </div>
              </div>
            </div>
          </div>
        )}

        {simulationResult.performance && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: '0.5rem' }}>
            <div className="text-small text-muted" style={{ marginBottom: '0.5rem' }}>性能指标</div>
            <div className="grid-2">
              <div>
                <div className="text-small text-muted">总计算时间</div>
                <div style={{ fontWeight: 600 }}>{simulationResult.performance.total_time.toFixed(3)}s</div>
              </div>
              <div>
                <div className="text-small text-muted">平均追踪耗时</div>
                <div style={{ fontWeight: 600 }}>{(simulationResult.performance.avg_ray_trace_time * 1000).toFixed(2)}ms</div>
              </div>
              <div>
                <div className="text-small text-muted">光线数量</div>
                <div style={{ fontWeight: 600 }}>{simulationResult.performance.ray_count}</div>
              </div>
              <div>
                <div className="text-small text-muted">交点总数</div>
                <div style={{ fontWeight: 600 }}>{simulationResult.performance.total_intersections}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlaybackPage;
