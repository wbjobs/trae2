import { useEffect, useRef, useState, useCallback } from 'react';
import { useDashboardStore } from '../../store/dashboardStore';
import { MapPin } from 'lucide-react';

const HeatmapPanel = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const { heatmapData, heatmapType, setHeatmapType, anomalies, devices } = useDashboardStore();

  const heatmapTypes = [
    { key: 'temperature', label: '温度', unit: '°C', colors: ['#1a237e', '#283593', '#3949ab', '#5c6bc0', '#7986cb', '#9fa8da', '#ff8a65', '#ff7043', '#ff5722', '#f4511e', '#e64a19'] },
    { key: 'humidity', label: '湿度', unit: '%', colors: ['#0d47a1', '#1565c0', '#1976d2', '#1e88e5', '#2196f3', '#42a5f5', '#64b5f6', '#90caf9', '#bbdefb', '#e3f2fd'] },
    { key: 'co2', label: 'CO₂', unit: 'ppm', colors: ['#1b5e20', '#2e7d32', '#388e3c', '#43a047', '#66bb6a', '#9ccc65', '#d4e157', '#fee08b', '#fc8d59', '#d73027'] },
    { key: 'ch4', label: 'CH₄', unit: '%LEL', colors: ['#000', '#1a0000', '#330000', '#4d0000', '#660000', '#800000', '#990000', '#b30000', '#cc0000', '#e60000', '#ff0000'] },
  ];

  const currentType = heatmapTypes.find((t) => t.key === heatmapType)!;

  const getColorRange = useCallback((type: string) => {
    let maxVal = 40;
    let minVal = 15;
    
    if (type === 'humidity') {
      maxVal = 80;
      minVal = 30;
    } else if (type === 'co2') {
      maxVal = 2500;
      minVal = 400;
    } else if (type === 'ch4') {
      maxVal = 100;
      minVal = 0;
    }
    return { maxVal, minVal };
  }, []);

  const getColor = useCallback((value: number, colors: string[], type: string): string => {
    const { maxVal, minVal } = getColorRange(type);
    const normalized = Math.min(1, Math.max(0, (value - minVal) / (maxVal - minVal)));
    const index = Math.min(colors.length - 1, Math.floor(normalized * (colors.length - 1)));
    return colors[index];
  }, [getColorRange]);

  const getValueRange = useCallback(() => {
    if (!heatmapData || heatmapData.length === 0) return { min: 0, max: 100 };
    const values = heatmapData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 100 };
  }, [heatmapData]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0a1628');
    gradient.addColorStop(0.5, '#0d1f3c');
    gradient.addColorStop(1, '#0a1628');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 10) * width, 0);
      ctx.lineTo((i / 10) * width, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (i / 10) * height);
      ctx.lineTo(width, (i / 10) * height);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    
    ctx.beginPath();
    ctx.moveTo(width * 0.05, height * 0.25);
    ctx.lineTo(width * 0.95, height * 0.25);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(width * 0.05, height * 0.5);
    ctx.lineTo(width * 0.95, height * 0.5);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(width * 0.05, height * 0.75);
    ctx.lineTo(width * 0.95, height * 0.75);
    ctx.stroke();
    
    ctx.setLineDash([]);

    if (heatmapData && heatmapData.length > 0) {
      const aggregatedData = new Map<string, number>();
      heatmapData.forEach((point) => {
        const key = `${point.x.toFixed(0)}-${point.y.toFixed(0)}`;
        const existing = aggregatedData.get(key) || 0;
        aggregatedData.set(key, Math.max(existing, point.value));
      });

      aggregatedData.forEach((value, key) => {
        const [x, y] = key.split('-').map(Number);
        const canvasX = (x / 100) * width;
        const canvasY = (y / 100) * height;
        const color = getColor(value, currentType.colors, heatmapType);

        const radius = 35;
        const radialGradient = ctx.createRadialGradient(canvasX, canvasY, 0, canvasX, canvasY, radius);
        radialGradient.addColorStop(0, color + '80');
        radialGradient.addColorStop(0.5, color + '40');
        radialGradient.addColorStop(1, color + '00');

        ctx.fillStyle = radialGradient;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, radius, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (devices && devices.length > 0) {
      devices.forEach((device) => {
        const canvasX = (device.location.x / 100) * width;
        const canvasY = (device.location.y / 100) * height;

        ctx.fillStyle = device.status === 'normal' ? '#4caf50' : device.status === 'warning' ? '#ffc107' : '#ff3366';
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (device.status !== 'normal') {
          ctx.strokeStyle = device.status === 'warning' ? '#ffc107' : '#ff3366';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(canvasX, canvasY, 12, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    }

    if (anomalies && anomalies.length > 0) {
      const time = Date.now();
      anomalies.forEach((anomaly) => {
        const canvasX = (anomaly.location.x / 100) * width;
        const canvasY = (anomaly.location.y / 100) * height;
        const color = anomaly.level === 'critical' ? '#ff3366' : anomaly.level === 'high' ? '#ff6b35' : anomaly.level === 'medium' ? '#ffc107' : '#4caf50';

        const pulseRadius = 15 + Math.sin(time / 500) * 5;
        ctx.strokeStyle = color + '80';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, 8, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.fillStyle = 'rgba(0, 212, 255, 0.6)';
    ctx.font = '12px Inter';
    ctx.fillText('管廊区域分布示意图', width * 0.05, height * 0.08);

    animationRef.current = requestAnimationFrame(render);
  }, [heatmapData, heatmapType, anomalies, devices, currentType, getColor]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(render);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);

  const range = getValueRange();

  return (
    <div className="bg-gradient-to-br from-[#0d1f3c]/80 to-[#0a1628]/80 rounded-xl border border-[#00d4ff]/20 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#00d4ff]" />
          <h3 className="text-white font-semibold">管廊空间热力分布</h3>
        </div>
        <div className="flex gap-2">
          {heatmapTypes.map((type) => (
            <button
              key={type.key}
              onClick={() => setHeatmapType(type.key as any)}
              className={`px-3 py-1 rounded-lg text-sm transition-all ${heatmapType === type.key ? 'bg-[#00d4ff] text-[#0a1628] font-semibold' : 'bg-white/5 text-[#8aa4c4] hover:bg-white/10'}`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          className="w-full h-full rounded-lg"
        />
        
        <div className="absolute bottom-4 left-4 bg-[#0a1628]/90 rounded-lg p-3 backdrop-blur-sm border border-[#00d4ff]/20">
          <div className="text-xs text-[#8aa4c4] mb-2">
            {currentType.label} ({currentType.unit})
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: currentType.colors[0] }}
            />
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: currentType.colors[Math.floor(currentType.colors.length / 2)] }}
            />
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: currentType.colors[currentType.colors.length - 1] }}
            />
          </div>
          <div className="flex justify-between text-xs text-[#5a7a9a] mt-1">
            <span>{range.min.toFixed(0)}</span>
            <span>{range.max.toFixed(0)}</span>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 bg-[#0a1628]/90 rounded-lg p-3 backdrop-blur-sm border border-[#00d4ff]/20">
          <div className="text-xs text-[#8aa4c4] mb-2">图例</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs text-[#8aa4c4]">设备正常</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-xs text-[#8aa4c4]">设备警告</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs text-[#8aa4c4]">设备异常</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeatmapPanel;
