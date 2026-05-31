import { useEffect, useRef } from 'react';
import type { HeatmapData, StationInfo } from '@/types';

interface StationMapProps {
  stations: StationInfo[];
  heatmapData?: HeatmapData[];
  selectedStation?: string | null;
  onStationClick?: (station: StationInfo) => void;
  showHeatmap?: boolean;
}

const lineColors: Record<string, string> = {
  L1: '#ef4444',
  L2: '#3b82f6',
  L3: '#22c55e',
  L4: '#f59e0b',
  L5: '#8b5cf6',
};

export default function StationMap({
  stations,
  heatmapData = [],
  selectedStation,
  onStationClick,
  showHeatmap = false,
}: StationMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 900;
    canvas.height = 500;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const lines: Record<string, StationInfo[]> = {};
    stations.forEach(station => {
      if (!lines[station.lineId]) {
        lines[station.lineId] = [];
      }
      lines[station.lineId].push(station);
    });

    Object.entries(lines).forEach(([lineId, lineStations]) => {
      ctx.strokeStyle = lineColors[lineId] || '#64748b';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      lineStations.forEach((station, index) => {
        const x = station.position.x;
        const y = station.position.y;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });

    stations.forEach(station => {
      const x = station.position.x;
      const y = station.position.y;

      if (showHeatmap) {
        const heatData = heatmapData.find(h => h.stationId === station.stationId);
        if (heatData) {
          const intensity = heatData.intensity / 100;
          const radius = 15 + intensity * 25;
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          gradient.addColorStop(0, `rgba(239, 68, 68, ${intensity * 0.8})`);
          gradient.addColorStop(0.5, `rgba(249, 115, 22, ${intensity * 0.4})`);
          gradient.addColorStop(1, 'rgba(249, 115, 22, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = selectedStation === station.stationId ? '#06b6d4' : '#334155';
      ctx.strokeStyle = lineColors[station.lineId] || '#64748b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(station.stationName, x, y + 22);
    });
  }, [stations, heatmapData, selectedStation, showHeatmap]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg cursor-pointer"
        onClick={(e) => {
          if (!onStationClick) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const scaleX = 900 / rect.width;
          const scaleY = 500 / rect.height;
          const x = (e.clientX - rect.left) * scaleX;
          const y = (e.clientY - rect.top) * scaleY;

          for (const station of stations) {
            const dx = x - station.position.x;
            const dy = y - station.position.y;
            if (Math.sqrt(dx * dx + dy * dy) < 15) {
              onStationClick(station);
              break;
            }
          }
        }}
      />
      <div className="absolute top-4 right-4 bg-slate-900/80 rounded-lg p-3 text-xs">
        <p className="text-slate-400 mb-2">线路图例</p>
        {Object.entries(lineColors).map(([lineId, color]) => (
          <div key={lineId} className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
            <span className="text-slate-300">{lineId.replace('L', '')}号线</span>
          </div>
        ))}
      </div>
    </div>
  );
}
