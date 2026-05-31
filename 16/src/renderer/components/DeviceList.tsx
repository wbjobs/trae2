import { DeviceDescriptor, ConnectionState } from '../../shared/types';

interface DeviceListProps {
  devices: DeviceDescriptor[];
  selectedDevice: DeviceDescriptor | null;
  connectionStates: Map<string, ConnectionState>;
  onSelect: (device: DeviceDescriptor) => void;
}

export default function DeviceList({ devices, selectedDevice, connectionStates, onSelect }: DeviceListProps) {
  const getDeviceIcon = (device: DeviceDescriptor) => {
    switch (device.category) {
      case 'keyboard':
        return '⌨️';
      case 'mouse':
        return '🖱️';
      case 'gamepad':
        return '🎮';
      case 'joystick':
        return '🕹️';
      case 'industrial-io':
      case 'serial-console':
        return '🔧';
      default:
        return '📦';
    }
  };

  return (
    <div className="device-list">
      {devices.map((device) => (
        <div
          key={device.id}
          className={`device-item ${selectedDevice?.id === device.id ? 'active' : ''}`}
          onClick={() => onSelect(device)}
        >
          <div className="device-icon">{getDeviceIcon(device)}</div>
          <div className="device-info">
            <div className="device-name">{device.name}</div>
            <div className="device-meta">{device.vendor}</div>
          </div>
          <div
            className={`connection-status ${connectionStates.get(device.id)?.connected ? 'connected' : ''}`}
            title={connectionStates.get(device.id)?.connected ? '已连接' : '未连接'}
          />
        </div>
      ))}
      {devices.length === 0 && (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>未检测到设备</p>
        </div>
      )}
    </div>
  );
}
