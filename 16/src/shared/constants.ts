export const IPC_CHANNELS = {
  LIST_DEVICES: 'tuner:list-devices',
  CONNECT: 'tuner:connect',
  DISCONNECT: 'tuner:disconnect',
  GET_PARAMETERS: 'tuner:get-parameters',
  READ_PARAMETER: 'tuner:read-parameter',
  WRITE_PARAMETER: 'tuner:write-parameter',
  BATCH_READ: 'tuner:batch-read',
  BATCH_WRITE: 'tuner:batch-write',
  GET_DRIVER_STATUS: 'tuner:get-driver-status',
  REFRESH_DRIVERS: 'tuner:refresh-drivers',
  EXPORT_CONFIG: 'tuner:export-config',
  IMPORT_CONFIG: 'tuner:import-config',
  GET_PRESETS: 'tuner:get-presets',
  APPLY_PRESET: 'tuner:apply-preset',
  CREATE_PRESET: 'tuner:create-preset',
  GET_ACTIVE_ALERTS: 'tuner:get-active-alerts',
  DISMISS_ALERT: 'tuner:dismiss-alert',
  ACKNOWLEDGE_ALERT: 'tuner:acknowledge-alert',
  ON_PARAMETER_CHANGED: 'tuner:on-parameter-changed',
  ON_DEVICE_EVENT: 'tuner:on-device-event',
  ON_ALERT: 'tuner:on-alert',
} as const;

export const STORAGE_KEYS = {
  PROFILES: 'tuner.profiles',
  LAST_DEVICE: 'tuner.lastDevice',
};

export const APP_EVENTS = {
  DEVICE_CONNECTED: 'device:connected',
  DEVICE_DISCONNECTED: 'device:disconnected',
  DEVICE_ERROR: 'device:error',
  PARAMETER_UPDATED: 'parameter:updated',
  DRIVER_REFRESHED: 'driver:refreshed',
};
