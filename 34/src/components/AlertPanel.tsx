import { AlertTriangle, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import type { AlertRecord } from '@/types';

interface AlertPanelProps {
  alerts: AlertRecord[];
  maxItems?: number;
  showAll?: boolean;
}

const alertTypeIcons = {
  high_flow: AlertTriangle,
  sudden_increase: TrendingUp,
  abnormal_drop: TrendingDown,
};

const alertTypeLabels = {
  high_flow: '高客流',
  sudden_increase: '客流突增',
  abnormal_drop: '异常下降',
};

export default function AlertPanel({ alerts, maxItems = 10, showAll = false }: AlertPanelProps) {
  const displayAlerts = showAll ? alerts : alerts.slice(0, maxItems);

  if (displayAlerts.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-500">暂无预警信息</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {displayAlerts.map((alert) => {
        const Icon = alertTypeIcons[alert.alertType] || AlertTriangle;
        return (
          <div
            key={alert.id}
            className={`p-3 rounded-lg border transition-all hover:scale-[1.01] ${
              alert.alertLevel === 'danger'
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-orange-500/10 border-orange-500/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <Icon
                className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                  alert.alertLevel === 'danger' ? 'text-red-400' : 'text-orange-400'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      alert.alertLevel === 'danger'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-orange-500/20 text-orange-400'
                    }`}
                  >
                    {alertTypeLabels[alert.alertType]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(alert.timestamp).toLocaleTimeString('zh-CN')}
                  </span>
                </div>
                <p className="text-sm text-white mt-1 font-medium">{alert.stationName}</p>
                <p className="text-xs text-slate-400 mt-0.5">{alert.message}</p>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span className="text-slate-500">
                    阈值: <span className="text-slate-300">{alert.threshold.toLocaleString()}</span>
                  </span>
                  <span className="text-slate-500">
                    实际: <span className="text-white">{alert.actualValue.toLocaleString()}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
