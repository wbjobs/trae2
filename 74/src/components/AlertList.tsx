import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, CheckCircle, XCircle, Clock4 } from 'lucide-react';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { AnomalyAlert } from '../../shared/types.js';
import { formatTime, getSeverityLabel, getAnomalyTypeLabel, getAlertStatusLabel, getStatusColor, getStatusBgColor } from '../utils/format.js';
import { cn } from '../lib/utils.js';

interface AlertListProps {
  showFilters?: boolean;
}

export const AlertList: React.FC<AlertListProps> = ({ showFilters = false }) => {
  const alerts = useSecurityStore(state => state.alerts);
  const fetchAlerts = useSecurityStore(state => state.fetchAlerts);
  const updateAlertStatus = useSecurityStore(state => state.updateAlertStatus);
  const [filter, setFilter] = useState<AnomalyAlert['status'] | 'all'>('all');

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const filteredAlerts = filter === 'all'
    ? alerts
    : alerts.filter(a => a.status === filter);

  const handleStatusChange = async (alertId: string, status: AnomalyAlert['status']) => {
    await updateAlertStatus(alertId, status);
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-cyan-400 font-bold text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          实时告警
        </h3>
        {showFilters && (
          <div className="flex gap-2">
            {(['all', 'pending', 'processing', 'resolved', 'acknowledged'] as const).map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-all',
                  filter === status
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-slate-700/50 text-gray-400 border border-transparent hover:bg-slate-700'
                )}
              >
                {status === 'all' ? '全部' : status === 'acknowledged' ? '已处置' : getAlertStatusLabel(status)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <CheckCircle className="w-12 h-12 mb-2 opacity-50" />
            <p>暂无告警信息</p>
          </div>
        ) : (
            filteredAlerts.slice(0, 20).map(alert => (
              <div
                key={alert.id}
                className={cn(
                  'p-3 rounded-lg border transition-all hover:scale-[1.01]',
                  getStatusBgColor(alert.level)
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getStatusColor(alert.level))}>
                        {getSeverityLabel(alert.level)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {getAnomalyTypeLabel(alert.type)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200 font-medium mt-1">
                      {alert.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {alert.deviceName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(alert.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={cn(
                      'px-2 py-1 rounded text-xs',
                      getStatusBgColor(alert.status)
                    )}>
                      {getAlertStatusLabel(alert.status)}
                    </span>
                    {alert.status === 'pending' && (
                      <div className="flex gap-1 mt-2">
                        <button
                          onClick={() => handleStatusChange(alert.id, 'processing')}
                          className="p-1 rounded hover:bg-cyan-500/20 text-cyan-400"
                          title="处理中"
                        >
                          <Clock4 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleStatusChange(alert.id, 'resolved')}
                          className="p-1 rounded hover:bg-green-500/20 text-green-400"
                          title="已解决"
                        >
                          <CheckCircle className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleStatusChange(alert.id, 'ignored')}
                          className="p-1 rounded hover:bg-gray-500/20 text-gray-400"
                          title="忽略"
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
      </div>
    </div>
  );
};

export default AlertList;
