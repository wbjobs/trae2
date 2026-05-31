import { useState, useEffect, useRef } from 'react';
import { Stats } from '@react-three/drei';
import { ChevronUp, ChevronDown, Activity, Triangle, Layers, Zap } from 'lucide-react';

interface RenderStatsProps {
  showPanels?: boolean;
  className?: string;
}

export default function RenderStats({ showPanels = true, className = '' }: RenderStatsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [drawCalls, setDrawCalls] = useState(0);
  const [triangles, setTriangles] = useState(0);
  const [points, setPoints] = useState(0);
  const [lines, setLines] = useState(0);
  const renderCount = useRef(0);

  useEffect(() => {
    if (!showPanels) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          const statsPanel = document.querySelector('.rs-stats');
          if (statsPanel) {
            const panels = statsPanel.querySelectorAll('.rs-panel');
            panels.forEach((panel, index) => {
              const value = panel.querySelector('.rs-value')?.textContent;
              if (value) {
                const num = parseInt(value.replace(/,/g, ''), 10);
                switch (index) {
                  case 1:
                    setDrawCalls(num);
                    break;
                  case 2:
                    setTriangles(num);
                    break;
                  case 3:
                    setPoints(num);
                    break;
                  case 4:
                    setLines(num);
                    break;
                }
              }
            });
          }
        }
      });
    });

    const checkPanel = () => {
      const statsPanel = document.querySelector('.rs-stats');
      if (statsPanel) {
        observer.observe(statsPanel, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      } else {
        setTimeout(checkPanel, 500);
      }
    };

    checkPanel();

    return () => observer.disconnect();
  }, [showPanels]);

  if (!showPanels) {
    return (
      <div className="hidden">
        <Stats className="hidden" />
      </div>
    );
  }

  return (
    <div
      className={`fixed top-4 right-4 z-50 bg-geo-dark/90 backdrop-blur-md border border-geo-border rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${className}`}
      style={{ width: 200 }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-geo-dark-light/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-geo-orange" />
          <span className="text-sm font-medium text-geo-text">渲染统计</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-geo-text-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-geo-text-muted" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-geo-blue" />
                <span className="text-xs text-geo-text-muted">Draw Calls</span>
              </div>
              <span className="text-sm font-mono font-semibold text-geo-text">
                {drawCalls.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Triangle className="w-3.5 h-3.5 text-geo-green" />
                <span className="text-xs text-geo-text-muted">三角形</span>
              </div>
              <span className="text-sm font-mono font-semibold text-geo-text">
                {triangles.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-geo-orange" />
                <span className="text-xs text-geo-text-muted">顶点数</span>
              </div>
              <span className="text-sm font-mono font-semibold text-geo-text">
                {(triangles * 3).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-geo-border">
            <div className="text-[10px] text-geo-text-muted mb-1">性能指示</div>
            <div className="h-2 bg-geo-dark rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  drawCalls < 100
                    ? 'bg-geo-green'
                    : drawCalls < 300
                    ? 'bg-geo-orange'
                    : 'bg-red-500'
                }`}
                style={{ width: `${Math.min((drawCalls / 500) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-geo-text-muted">
              <span>优</span>
              <span>良</span>
              <span>差</span>
            </div>
          </div>
        </div>
      )}

      <div className="absolute" style={{ opacity: 0, pointerEvents: 'none' }}>
        <Stats showPanel={0} className="opacity-0" />
      </div>
    </div>
  );
}
