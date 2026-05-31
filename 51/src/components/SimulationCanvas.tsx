import { useEffect, useRef } from 'react';
import type { OpticalElement, SimulationResult } from '../types';

interface SimulationCanvasProps {
  result: SimulationResult | null;
  elements: OpticalElement[];
  simulationType: string;
}

const elementColors: Record<string, { fill: string; stroke: string }> = {
  lens: { fill: '#3b82f6', stroke: '#60a5fa' },
  mirror: { fill: '#fbbf24', stroke: '#f59e0b' },
  beam_splitter: { fill: '#a855f7', stroke: '#c084fc' },
  detector: { fill: '#22c55e', stroke: '#16a34a' },
  aperture: { fill: '#ef4444', stroke: '#f87171' },
  filter: { fill: '#06b6d4', stroke: '#22d3ee' },
  grating: { fill: '#f97316', stroke: '#fb923c' },
  waveplate: { fill: '#8b5cf6', stroke: '#a78bfa' },
  prism: { fill: '#14b8a6', stroke: '#2dd4bf' },
};

function getElementColor(type: string) {
  return elementColors[type] || { fill: '#64748b', stroke: '#94a3b8' };
}

function drawElementShape(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number
) {
  const colors = getElementColor(type);

  ctx.save();

  switch (type) {
    case 'lens':
      ctx.fillStyle = colors.fill;
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 30, Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;

    case 'mirror':
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x - 3, y - 30, 6, 60);
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, y - 30, 6, 60);
      break;

    case 'beam_splitter':
      ctx.fillStyle = colors.fill;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-20, -3, 40, 6);
      ctx.restore();
      break;

    case 'detector':
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x - 5, y - 25, 10, 50);
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 5, y - 25, 10, 50);
      break;

    case 'aperture':
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x - 2, y - 20, 4, -30);
      ctx.fillRect(x - 2, y + 20, 4, 30);
      break;

    case 'filter':
      ctx.fillStyle = colors.fill;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x - 2, y - 25, 4, 50);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 2, y - 25, 4, 50);
      break;

    case 'grating':
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1;
      for (let i = -20; i <= 20; i += 4) {
        ctx.beginPath();
        ctx.moveTo(x - 5, y + i);
        ctx.lineTo(x + 5, y + i);
        ctx.stroke();
      }
      break;

    case 'waveplate':
      ctx.fillStyle = colors.fill;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - 4, y - 25, 8, 50);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.stroke;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x - 4, y - 25, 8, 50);
      ctx.setLineDash([]);
      break;

    case 'prism':
      ctx.fillStyle = colors.fill;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y - 25);
      ctx.lineTo(x - 22, y + 20);
      ctx.lineTo(x + 22, y + 20);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;

    default:
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x - 10, y - 15, 20, 30);
  }

  ctx.restore();
}

function SimulationCanvas({ result, elements, simulationType }: SimulationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const scale = 2;
    const offsetX = 50;
    const offsetY = height / 2;

    const drawGrid = () => {
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

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, offsetY);
      ctx.lineTo(width, offsetY);
      ctx.stroke();
    };

    const drawElements = () => {
      elements.forEach((elem) => {
        const x = offsetX + elem.position.x * scale;
        const y = offsetY + elem.position.y * scale;

        drawElementShape(ctx, elem.type, x, y);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(elem.id, x, y + 45);
      });
    };

    const drawRays = () => {
      if (!result?.rays) return;

      result.rays.forEach((ray, index) => {
        if (ray.path.length < 2) return;

        const hue = (index * 360) / result.rays!.length;
        const opacity = Math.min(0.8, 0.2 + ray.intensity * 3);
        ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${opacity})`;
        ctx.lineWidth = Math.max(0.5, 1 + ray.intensity * 2);

        ctx.beginPath();
        const startX = offsetX + ray.path[0][0] * scale;
        const startY = offsetY + ray.path[0][1] * scale;
        ctx.moveTo(startX, startY);

        for (let i = 1; i < ray.path.length; i++) {
          const px = offsetX + ray.path[i][0] * scale;
          const py = offsetY + ray.path[i][1] * scale;
          ctx.lineTo(px, py);
        }

        ctx.stroke();

        if (ray.path.length > 1) {
          const lastPoint = ray.path[ray.path.length - 1];
          const endX = offsetX + lastPoint[0] * scale;
          const endY = offsetY + lastPoint[1] * scale;

          ctx.fillStyle = `hsla(${hue}, 70%, 70%, ${Math.min(1, ray.intensity * 2)})`;
          ctx.beginPath();
          ctx.arc(endX, endY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      const detector = elements.find((e) => e.type === 'detector');
      if (detector && result.detector?.spots) {
        const detX = offsetX + detector.position.x * scale;
        const detY = offsetY + detector.position.y * scale;

        result.detector.spots.forEach((spot, i) => {
          const spotX = detX + (spot.position[0] || 0) * scale;
          const spotY = detY + (spot.position[1] || 0) * scale;

          ctx.fillStyle = `rgba(34, 197, 94, ${Math.min(1, spot.intensity * 2)})`;
          ctx.beginPath();
          ctx.arc(spotX, spotY, 2 + spot.intensity * 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    };

    const drawIntensity = () => {
      if (!result?.intensity) return;

      const intensity = result.intensity as number[][];
      const imgData = ctx.createImageData(width, height);

      const scaleX = intensity[0].length / width;
      const scaleY = intensity.length / height;

      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const ix = Math.floor(px * scaleX);
          const iy = Math.floor(py * scaleY);
          const value = intensity[iy]?.[ix] || 0;

          const idx = (py * width + px) * 4;
          const colorValue = Math.floor(value * 255);

          if (simulationType === 'michelson' || simulationType === 'young') {
            imgData.data[idx] = Math.min(255, colorValue + 30);
            imgData.data[idx + 1] = Math.floor(colorValue * 0.7);
            imgData.data[idx + 2] = Math.floor(colorValue * 0.4);
          } else if (simulationType === 'diffraction') {
            imgData.data[idx] = colorValue;
            imgData.data[idx + 1] = Math.floor(colorValue * 0.9);
            imgData.data[idx + 2] = Math.floor(colorValue * 0.8);
          } else {
            imgData.data[idx] = colorValue;
            imgData.data[idx + 1] = colorValue;
            imgData.data[idx + 2] = colorValue;
          }
          imgData.data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);
    };

    const drawInfoOverlay = () => {
      if (!result) return;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(10, 10, 180, result.recording?.enabled ? 70 : 50);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';

      if (result.summary) {
        ctx.fillText(`光线: ${result.summary.total_rays}`, 20, 28);
        ctx.fillText(
          `接收: ${result.summary.rays_reaching_detector}`,
          20,
          44
        );
      }

      if (result.performance) {
        ctx.fillText(
          `耗时: ${result.performance.total_time.toFixed(2)}s`,
          20,
          60
        );
      }

      if (result.recording?.enabled) {
        ctx.fillText(
          `帧: ${result.recording.frame_count}`,
          20,
          76
        );
      }
    };

    const drawPlaceholder = () => {
      ctx.fillStyle = '#475569';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('配置元件后运行仿真查看结果', width / 2, height / 2);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('支持光线追踪、干涉、衍射等多种仿真模式', width / 2, height / 2 + 30);
    };

    drawGrid();

    if (result?.intensity) {
      drawIntensity();
    } else {
      drawElements();
      if (result?.rays) {
        drawRays();
      }
    }

    drawInfoOverlay();

    if (!result) {
      drawPlaceholder();
    }
  }, [result, elements, simulationType]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={500}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '0.5rem',
      }}
    />
  );
}

export default SimulationCanvas;
