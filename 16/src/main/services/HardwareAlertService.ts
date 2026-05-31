import { EventEmitter } from 'events';
import { DeviceDescriptor } from '../../shared/types';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertCategory =
  | 'connection'
  | 'parameter'
  | 'driver'
  | 'hardware'
  | 'power'
  | 'system';

export interface HardwareAlert {
  id: string;
  timestamp: number;
  severity: AlertSeverity;
  category: AlertCategory;
  deviceId: string;
  deviceName?: string;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  acknowledged: boolean;
  autoDismiss: boolean;
  dismissAfter?: number;
}

export interface AlertHandler {
  onAlert?: (alert: HardwareAlert) => void;
  onAlertCleared?: (alertId: string) => void;
}

export class HardwareAlertService extends EventEmitter {
  private alerts: Map<string, HardwareAlert> = new Map();
  private dismissedAlerts: Set<string> = new Set();
  private alertHandlers: Set<AlertHandler> = new Set();
  private rateLimitMap: Map<string, number> = new Map();
  private readonly RATE_LIMIT_MS = 5000;

  addHandler(handler: AlertHandler): () => void {
    this.alertHandlers.add(handler);
    return () => this.alertHandlers.delete(handler);
  }

  raise(alert: Omit<HardwareAlert, 'id' | 'timestamp' | 'acknowledged'>): HardwareAlert {
    const rateLimitKey = `${alert.deviceId}-${alert.category}-${alert.title}`;
    const lastRaised = this.rateLimitMap.get(rateLimitKey);
    const now = Date.now();

    if (lastRaised && now - lastRaised < this.RATE_LIMIT_MS) {
      return this.alerts.get(rateLimitKey) || ({} as HardwareAlert);
    }

    this.rateLimitMap.set(rateLimitKey, now);

    const fullAlert: HardwareAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      acknowledged: false,
    };

    this.alerts.set(fullAlert.id, fullAlert);
    this.emit('alert', fullAlert);

    for (const handler of this.alertHandlers) {
      handler.onAlert?.(fullAlert);
    }

    if (fullAlert.autoDismiss && fullAlert.dismissAfter) {
      setTimeout(() => {
        this.dismiss(fullAlert.id);
      }, fullAlert.dismissAfter);
    }

    return fullAlert;
  }

  raiseConnectionError(device: DeviceDescriptor, error: string): HardwareAlert {
    return this.raise({
      severity: 'error',
      category: 'connection',
      deviceId: device.id,
      deviceName: device.name,
      title: '连接失败',
      message: `无法连接到 ${device.name}: ${error}`,
      details: { error, vendorId: device.vendorId, productId: device.productId },
      autoDismiss: true,
      dismissAfter: 8000,
    });
  }

  raiseConnectionLost(device: DeviceDescriptor, attempts: number): HardwareAlert {
    return this.raise({
      severity: 'warning',
      category: 'connection',
      deviceId: device.id,
      deviceName: device.name,
      title: '连接中断',
      message: `${device.name} 连接已中断，正在尝试重连 (${attempts}/3)`,
      details: { attempts },
      autoDismiss: false,
    });
  }

  raiseConnectionRestored(device: DeviceDescriptor): HardwareAlert {
    return this.raise({
      severity: 'info',
      category: 'connection',
      deviceId: device.id,
      deviceName: device.name,
      title: '连接恢复',
      message: `${device.name} 已重新连接`,
      autoDismiss: true,
      dismissAfter: 3000,
    });
  }

  raiseParameterWriteError(
    device: DeviceDescriptor,
    paramId: string,
    value: number | boolean | string,
    error: string,
  ): HardwareAlert {
    return this.raise({
      severity: 'warning',
      category: 'parameter',
      deviceId: device.id,
      deviceName: device.name,
      title: '参数写入失败',
      message: `无法写入参数 ${paramId} (值: ${value}): ${error}`,
      details: { paramId, value, error },
      autoDismiss: true,
      dismissAfter: 5000,
    });
  }

  raiseDriverIssue(device: DeviceDescriptor, status: string, message: string): HardwareAlert {
    return this.raise({
      severity: status === 'missing' ? 'error' : 'warning',
      category: 'driver',
      deviceId: device.id,
      deviceName: device.name,
      title: status === 'missing' ? '驱动缺失' : '驱动异常',
      message,
      details: { status },
      autoDismiss: false,
    });
  }

  raiseHardwareFault(device: DeviceDescriptor, faultCode: string, description: string): HardwareAlert {
    return this.raise({
      severity: 'critical',
      category: 'hardware',
      deviceId: device.id,
      deviceName: device.name,
      title: '硬件故障',
      message: `${device.name} 检测到故障 [${faultCode}]: ${description}`,
      details: { faultCode, description },
      autoDismiss: false,
    });
  }

  raisePowerWarning(device: DeviceDescriptor, batteryLevel?: number): HardwareAlert {
    return this.raise({
      severity: 'warning',
      category: 'power',
      deviceId: device.id,
      deviceName: device.name,
      title: '电量不足',
      message: batteryLevel
        ? `${device.name} 电量低 (${batteryLevel}%)，请充电或更换电池`
        : `${device.name} 电量不足`,
      details: { batteryLevel },
      autoDismiss: true,
      dismissAfter: 10000,
    });
  }

  raiseMacOSPermissionIssue(device: DeviceDescriptor): HardwareAlert {
    return this.raise({
      severity: 'error',
      category: 'system',
      deviceId: device.id,
      deviceName: device.name,
      title: '权限不足',
      message: `macOS 阻止了对 ${device.name} 的访问。请在"系统设置 > 隐私与安全性 > 输入监控"中允许本应用访问。`,
      details: { platform: 'darwin' },
      autoDismiss: false,
    });
  }

  dismiss(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    this.alerts.delete(alertId);
    this.dismissedAlerts.add(alertId);

    this.emit('alert-cleared', alertId);
    for (const handler of this.alertHandlers) {
      handler.onAlertCleared?.(alertId);
    }

    return true;
  }

  acknowledge(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    this.emit('alert-updated', alert);
    return true;
  }

  getActiveAlerts(): HardwareAlert[] {
    return Array.from(this.alerts.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  getActiveAlertsForDevice(deviceId: string): HardwareAlert[] {
    return this.getActiveAlerts().filter((a) => a.deviceId === deviceId);
  }

  getSeverityCount(severity: AlertSeverity): number {
    return this.getActiveAlerts().filter((a) => a.severity === severity).length;
  }

  hasCriticalAlerts(): boolean {
    return this.getActiveAlerts().some((a) => a.severity === 'critical');
  }

  clearAll(): void {
    for (const id of this.alerts.keys()) {
      this.dismiss(id);
    }
  }

  clearForDevice(deviceId: string): void {
    for (const alert of this.getActiveAlertsForDevice(deviceId)) {
      this.dismiss(alert.id);
    }
  }
}

export const alertService = new HardwareAlertService();
