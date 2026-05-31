export type Platform = 'win32' | 'darwin' | 'linux' | 'unknown';

export function getPlatform(): Platform {
  const platform = process.platform;
  if (platform === 'win32') return 'win32';
  if (platform === 'darwin') return 'darwin';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}

export function isMacOS(): boolean {
  return getPlatform() === 'darwin';
}

export function isWindows(): boolean {
  return getPlatform() === 'win32';
}

export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

export const PLATFORM_CONFIG = {
  win32: {
    hidTimeout: 5000,
    serialBaudRate: 115200,
    driverCheckPaths: ['C:\\Windows\\System32\\drivers'],
    requiresAdmin: false,
  },
  darwin: {
    hidTimeout: 8000,
    serialBaudRate: 115200,
    driverCheckPaths: ['/Library/Extensions', '/System/Library/Extensions'],
    requiresAdmin: true,
    hidPermissionPrompt: true,
  },
  linux: {
    hidTimeout: 5000,
    serialBaudRate: 115200,
    driverCheckPaths: ['/lib/modules', '/etc/modules-load.d'],
    requiresAdmin: true,
  },
  unknown: {
    hidTimeout: 5000,
    serialBaudRate: 115200,
    driverCheckPaths: [],
    requiresAdmin: false,
  },
} as const;

export function getPlatformConfig() {
  return PLATFORM_CONFIG[getPlatform()];
}

export function getMacOSVersion(): string {
  if (!isMacOS()) return '';
  return process.release.lts || '';
}

export function needsHIDPermission(): boolean {
  return isMacOS();
}

export function getRecommendedPollingInterval(): number {
  return isMacOS() ? 100 : 50;
}
