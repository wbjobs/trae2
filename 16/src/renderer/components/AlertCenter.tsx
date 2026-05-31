import { HardwareAlert } from '@shared/api';

interface AlertCenterProps {
  alerts: HardwareAlert[];
  onDismiss: (alertId: string) => void;
}

export default function AlertCenter({ alerts, onDismiss }: AlertCenterProps) {
  const getAlertIcon = (severity: HardwareAlert['severity']) => {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (alerts.length === 0) {
    return (
      <div className="empty-presets">
        <div className="empty-presets-icon">✅</div>
        <h3>一切正常</h3>
        <p>当前没有任何硬件异常提醒</p>
      </div>
    );
  }

  return (
    <div className="alert-list">
      {alerts.map((alert) => (
        <div key={alert.id} className={`alert-item ${alert.severity}`}>
          <div className="alert-icon">{getAlertIcon(alert.severity)}</div>
          <div className="alert-content">
            <div className="alert-title">{alert.title}</div>
            <div className="alert-message">{alert.message}</div>
            <div className="alert-meta">
              <span>{alert.deviceName || '系统'}</span>
              <span>{formatTime(alert.timestamp)}</span>
              {alert.acknowledged && <span>已确认</span>}
            </div>
          </div>
          <div className="alert-actions">
            <button
              className="alert-btn"
              onClick={() => onDismiss(alert.id)}
            >
              关闭
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
