import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { DeviceDescriptor, DriverInfo, DriverStatus } from '../../shared/types';
import { Result, ok, err } from '../../shared/result';
import { getPlatform, getPlatformConfig, isMacOS, isWindows, isLinux } from '../utils/platform';

const execAsync = promisify(exec);

export interface IDriverAdapter {
  detectDriver(device: DeviceDescriptor): Promise<Result<DriverInfo>>;
  getSupportedDevices(): DeviceDescriptor[];
  checkPermissions(device: DeviceDescriptor): Promise<boolean>;
}

export abstract class BaseDriverAdapter implements IDriverAdapter {
  abstract detectDriver(device: DeviceDescriptor): Promise<Result<DriverInfo>>;
  abstract getSupportedDevices(): DeviceDescriptor[];
  abstract checkPermissions(device: DeviceDescriptor): Promise<boolean>;

  protected parseVersion(versionStr: string): string {
    const match = versionStr.match(/\d+\.\d+(\.\d+)?/);
    return match ? match[0] : versionStr;
  }
}

export class MacOSDriverAdapter extends BaseDriverAdapter {
  private kextCache: Map<string, boolean> = new Map();
  private lastKextRefresh: number = 0;
  private readonly KEXT_CACHE_TTL = 30000;

  async detectDriver(device: DeviceDescriptor): Promise<Result<DriverInfo>> {
    try {
      const driverName = this.getDriverNameForDevice(device);
      const kextFound = await this.checkKextLoaded(driverName);
      const version = await this.getDriverVersion(driverName);

      let status: DriverStatus = 'unknown';
      let message = '';

      if (kextFound) {
        status = 'installed';
        message = 'Driver loaded successfully';
      } else {
        const kextExists = await this.checkKextExists(driverName);
        if (kextExists) {
          status = 'error';
          message = 'Driver installed but not loaded. May need restart or permission approval.';
        } else {
          status = 'missing';
          message = 'Driver not installed. Please install the manufacturer driver.';
        }
      }

      if (isMacOS() && device.transport === 'hid') {
        const hasPermission = await this.checkPermissions(device);
        if (!hasPermission) {
          status = 'error';
          message = 'HID permission denied. Please grant access in System Settings > Privacy & Security.';
        }
      }

      return ok({
        deviceId: device.id,
        status,
        driverName,
        driverVersion: version,
        message,
      });
    } catch (error) {
      return err(
        'DETECTION_FAILED',
        `Driver detection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  private getDriverNameForDevice(device: DeviceDescriptor): string {
    const vendorMap: Record<number, string> = {
      0x046d: 'Logitech',
      0x045e: 'Microsoft',
      0x1532: 'Razer',
      0x1038: 'SteelSeries',
      0x05ac: 'Apple',
      0x093a: 'Pixart',
    };
    return vendorMap[device.vendorId] || `Vendor_${device.vendorId.toString(16)}`;
  }

  private async checkKextLoaded(driverName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync('kextstat 2>/dev/null || true');
      return stdout.toLowerCase().includes(driverName.toLowerCase());
    } catch {
      return false;
    }
  }

  private async checkKextExists(driverName: string): Promise<boolean> {
    const config = getPlatformConfig();
    for (const dir of config.driverCheckPaths) {
      try {
        const files = await fs.promises.readdir(dir).catch(() => []);
        for (const file of files) {
          if (file.toLowerCase().includes(driverName.toLowerCase())) {
            return true;
          }
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  private async getDriverVersion(driverName: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`kextfind -bundle-id -name "${driverName}" 2>/dev/null || true`);
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        if (line.includes('CFBundleVersion')) {
          return this.parseVersion(line);
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  async checkPermissions(device: DeviceDescriptor): Promise<boolean> {
    if (!isMacOS()) return true;

    try {
      if (device.transport === 'hid') {
        try {
          const { stdout } = await execAsync('ioreg -c IOHIDDevice 2>/dev/null | head -100 || true');
          return stdout.length > 0;
        } catch {
          return true;
        }
      }
      return true;
    } catch {
      return true;
    }
  }

  getSupportedDevices(): DeviceDescriptor[] {
    return [];
  }

  async refreshKextCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastKextRefresh < this.KEXT_CACHE_TTL) {
      return;
    }

    try {
      await execAsync('kextcache -update-volume / 2>/dev/null || true');
      this.lastKextRefresh = now;
    } catch {
      // Cache refresh may fail without admin rights
    }
  }
}

export class WindowsDriverAdapter extends BaseDriverAdapter {
  async detectDriver(device: DeviceDescriptor): Promise<Result<DriverInfo>> {
    try {
      const driverName = this.getDriverNameForDevice(device);
      const info = await this.queryDriverInfo(device);

      let status: DriverStatus = 'unknown';
      let message = '';

      if (info.installed) {
        status = info.needsUpdate ? 'outdated' : 'installed';
        message = info.needsUpdate ? 'Driver update recommended' : 'Driver installed and working';
      } else {
        status = 'missing';
        message = 'Driver not found. Please install from Device Manager.';
      }

      return ok({
        deviceId: device.id,
        status,
        driverName,
        driverVersion: info.version,
        message,
      });
    } catch (error) {
      return err(
        'DETECTION_FAILED',
        `Driver detection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  private getDriverNameForDevice(device: DeviceDescriptor): string {
    const vendorMap: Record<number, string> = {
      0x046d: 'Logitech HID-compliant',
      0x045e: 'Microsoft HID',
      0x1532: 'Razer',
      0x1038: 'SteelSeries',
    };
    return vendorMap[device.vendorId] || 'HID-compliant device';
  }

  private async queryDriverInfo(device: DeviceDescriptor): Promise<{ installed: boolean; version?: string; needsUpdate: boolean }> {
    try {
      const vidPid = `VID_${device.vendorId.toString(16).padStart(4, '0')}&PID_${device.productId.toString(16).padStart(4, '0')}`;
      const { stdout } = await execAsync(`pnputil /enum-devices /class HIDClass 2>nul | findstr /i "${vidPid}" || echo NOT_FOUND`);

      if (stdout.includes('NOT_FOUND') || stdout.trim() === '') {
        return { installed: false, needsUpdate: false };
      }

      return { installed: true, version: '1.0.0', needsUpdate: false };
    } catch {
      return { installed: true, needsUpdate: false };
    }
  }

  async checkPermissions(device: DeviceDescriptor): Promise<boolean> {
    return true;
  }

  getSupportedDevices(): DeviceDescriptor[] {
    return [];
  }
}

export class LinuxDriverAdapter extends BaseDriverAdapter {
  async detectDriver(device: DeviceDescriptor): Promise<Result<DriverInfo>> {
    try {
      const driverName = this.getDriverNameForDevice(device);
      const loaded = await this.checkModuleLoaded(driverName);

      return ok({
        deviceId: device.id,
        status: loaded ? 'installed' : 'missing',
        driverName,
        message: loaded ? 'Driver module loaded' : 'Kernel module not loaded',
      });
    } catch (error) {
      return err('DETECTION_FAILED', 'Driver detection failed', error);
    }
  }

  private getDriverNameForDevice(device: DeviceDescriptor): string {
    return device.transport === 'hid' ? 'hid-generic' : 'usbhid';
  }

  private async checkModuleLoaded(moduleName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`lsmod | grep -i "${moduleName}" 2>/dev/null || true`);
      return stdout.trim().length > 0;
    } catch {
      return true;
    }
  }

  async checkPermissions(device: DeviceDescriptor): Promise<boolean> {
    try {
      if (device.path) {
        await fs.promises.access(device.path, fs.constants.R_OK | fs.constants.W_OK);
        return true;
      }
      return true;
    } catch {
      return false;
    }
  }

  getSupportedDevices(): DeviceDescriptor[] {
    return [];
  }
}

export class DriverAdapterFactory {
  private static instance: IDriverAdapter | null = null;

  static getAdapter(): IDriverAdapter {
    if (this.instance) return this.instance;

    const platform = getPlatform();
    switch (platform) {
      case 'darwin':
        this.instance = new MacOSDriverAdapter();
        break;
      case 'win32':
        this.instance = new WindowsDriverAdapter();
        break;
      case 'linux':
        this.instance = new LinuxDriverAdapter();
        break;
      default:
        this.instance = new WindowsDriverAdapter();
    }

    return this.instance;
  }
}
