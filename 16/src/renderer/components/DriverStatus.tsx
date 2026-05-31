import { DriverInfo } from '../../shared/types';

interface DriverStatusProps {
  driverInfo: DriverInfo;
  onRefresh: () => void;
}

export default function DriverStatus({ driverInfo, onRefresh }: DriverStatusProps) {
  const getStatusLabel = (status: DriverInfo['status']) => {
    switch (status) {
      case 'installed':
        return '驱动正常';
      case 'missing':
        return '驱动缺失';
      case 'outdated':
        return '驱动过时';
      case 'error':
        return '驱动异常';
      default:
        return '未知状态';
    }
  };

  return (
    <div className="parameter-group">
      <div className="group-header">
        <h4>驱动状态检测</h4>
      </div>
      <div className="group-body">
        <div className="driver-status-row">
          <div className="driver-info">
            <div className={`driver-status-indicator ${driverInfo.status}`} />
            <div>
              <div className="driver-name">{driverInfo.driverName}</div>
              <div className="driver-version">
                {driverInfo.driverVersion && `版本: ${driverInfo.driverVersion}`}
                {driverInfo.requiredVersion && ` (需要: ${driverInfo.requiredVersion})`}
              </div>
            </div>
            <span className={`status-badge ${driverInfo.status === 'installed' ? 'success' : driverInfo.status === 'error' || driverInfo.status === 'missing' ? 'error' : 'warning'}`}>
              {getStatusLabel(driverInfo.status)}
            </span>
          </div>
          <button className="btn btn-secondary" onClick={onRefresh}>
            刷新检测
          </button>
        </div>
        {driverInfo.message && (
          <div className="driver-message" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            💡 {driverInfo.message}
          </div>
        )}
      </div>
    </div>
  );
}
