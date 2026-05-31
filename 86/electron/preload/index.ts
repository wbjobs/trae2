import { contextBridge, ipcRenderer } from 'electron'

export interface CpuInfo {
  name: string
  vendor_id: string
  cores: number
  threads: number
  frequency_mhz: number
  usage_percent: number
  temperature_celsius?: number
  cache_l1_kb: number
  cache_l2_kb: number
  cache_l3_kb: number
}

export interface MemoryInfo {
  total_bytes: number
  used_bytes: number
  available_bytes: number
  free_bytes: number
  swap_total_bytes: number
  swap_used_bytes: number
  usage_percent: number
  speed_mhz?: number
  slots_used?: number
  slots_total?: number
}

export interface DiskInfo {
  name: string
  device_path: string
  total_bytes: number
  used_bytes: number
  free_bytes: number
  usage_percent: number
  filesystem: string
  mount_point: string
  is_removable: boolean
  drive_type: string
}

export interface NetworkInfo {
  interface_name: string
  mac_address: string
  ipv4_addresses: string[]
  ipv6_addresses: string[]
  rx_bytes: number
  tx_bytes: number
  rx_packets: number
  tx_packets: number
  speed_mbps?: number
  is_up: boolean
}

export interface MotherboardInfo {
  manufacturer: string
  model: string
  version: string
  serial_number: string
  bios_version: string
  bios_release_date?: string
  chipset?: string
}

export interface ExternalDevice {
  device_id: string
  name: string
  device_type: string
  vendor_id: string
  product_id: string
  serial_number?: string
  connection_type: string
  is_connected: boolean
}

export interface SensorData {
  sensor_id: string
  sensor_type: string
  name: string
  value: number
  unit: string
  timestamp: string
  status: string
}

export interface HardwareInfo {
  device_id: string
  hardware_type: string
  cpu?: CpuInfo
  memory?: MemoryInfo
  disks: DiskInfo[]
  networks: NetworkInfo[]
  motherboard?: MotherboardInfo
  external_devices: ExternalDevice[]
  sensors: SensorData[]
  collected_at: string
  extra: Array<[string, string]>
}

export interface CollectionResult {
  success: boolean
  data?: HardwareInfo
  error?: string
  collected_at: string
  duration_ms: number
}

export interface CollectorStatus {
  is_running: boolean
  collection_count: number
  last_collection_at?: string
  avg_duration_ms: number
  total_duration_ms: number
  error_count: number
}

export interface ReporterStatus {
  total_reports: number
  successful_reports: number
  failed_reports: number
  total_retries: number
  last_report_at?: string
  last_error?: string
  queue_size: number
}

export interface SystemInfo {
  os_name: string
  os_version: string
  architecture: string
  hostname: string
  kernel_version: string
  uptime_seconds: number
}

export interface ConfigFile {
  name: string
  path: string
}

const hardwareAPI = {
  init: () => ipcRenderer.invoke('hardware:init'),
  collectOnce: () => ipcRenderer.invoke('hardware:collectOnce') as Promise<CollectionResult[]>,
  collectParallel: () => ipcRenderer.invoke('hardware:collectParallel') as Promise<CollectionResult[]>,
  getSystemInfo: () => ipcRenderer.invoke('hardware:getSystemInfo') as Promise<SystemInfo>,
  getAggregatedData: () => ipcRenderer.invoke('hardware:getAggregatedData') as Promise<string>,
  getCollectorStatus: () => ipcRenderer.invoke('hardware:getCollectorStatus') as Promise<CollectorStatus>,
}

const configAPI = {
  load: (configPath: string) => ipcRenderer.invoke('config:load', configPath) as Promise<boolean>,
  loadFromJson: (jsonString: string) => ipcRenderer.invoke('config:loadFromJson', jsonString) as Promise<boolean>,
  get: () => ipcRenderer.invoke('config:get') as Promise<string>,
  readFile: (filePath: string) => ipcRenderer.invoke('config:readFile', filePath) as Promise<string>,
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('config:writeFile', filePath, content) as Promise<boolean>,
  deleteFile: (filePath: string) => ipcRenderer.invoke('config:deleteFile', filePath) as Promise<boolean>,
  listConfigs: (dirPath: string) => ipcRenderer.invoke('config:listConfigs', dirPath) as Promise<ConfigFile[]>,
  batchImport: (sourceDir: string, targetDir: string) => ipcRenderer.invoke('config:batchImport', sourceDir, targetDir) as Promise<{ imported: string[]; errors: string[]; total: number }>,
  batchExport: (configDir: string) => ipcRenderer.invoke('config:batchExport', configDir) as Promise<Array<{ name: string; content: string }>>,
  exportToFile: (targetPath: string, configs: Array<{ name: string; content: string }>) => ipcRenderer.invoke('config:exportToFile', targetPath, configs) as Promise<{ dir: string; count: number; files: string[] }>,
}

const reporterAPI = {
  init: (endpointUrl: string, authToken?: string, encryptionKey?: string) =>
    ipcRenderer.invoke('reporter:init', endpointUrl, authToken, encryptionKey) as Promise<boolean>,
  report: (data: string) => ipcRenderer.invoke('reporter:report', data) as Promise<boolean>,
  reportBatch: (dataArray: string[]) => ipcRenderer.invoke('reporter:reportBatch', dataArray) as Promise<boolean>,
  queueData: (data: string) => ipcRenderer.invoke('reporter:queueData', data) as Promise<void>,
  flush: () => ipcRenderer.invoke('reporter:flush') as Promise<boolean>,
  getStatus: () => ipcRenderer.invoke('reporter:getStatus') as Promise<ReporterStatus>,
}

const encryptionAPI = {
  generateKey: () => ipcRenderer.invoke('encryption:generateKey') as Promise<string>,
}

const appAPI = {
  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
  getPlatform: () => ipcRenderer.invoke('app:getPlatform') as Promise<string>,
  getAppPath: (name: string) => ipcRenderer.invoke('app:getAppPath', name) as Promise<string>,
  openExternal: (url: string) => ipcRenderer.send('external:open', url),
}

const eventAPI = {
  onConfigImport: (callback: (filePath: string) => void) => {
    const handler = (_: any, filePath: string) => callback(filePath)
    ipcRenderer.on('config:import', handler)
    return () => ipcRenderer.removeListener('config:import', handler)
  },
  onConfigExport: (callback: (filePath: string) => void) => {
    const handler = (_: any, filePath: string) => callback(filePath)
    ipcRenderer.on('config:export', handler)
    return () => ipcRenderer.removeListener('config:export', handler)
  },
  onActionRefresh: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('action:refresh', handler)
    return () => ipcRenderer.removeListener('action:refresh', handler)
  },
  onActionStart: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('action:start', handler)
    return () => ipcRenderer.removeListener('action:start', handler)
  },
  onActionStop: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('action:stop', handler)
    return () => ipcRenderer.removeListener('action:stop', handler)
  },
  onActionClear: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('action:clear', handler)
    return () => ipcRenderer.removeListener('action:clear', handler)
  },
}

contextBridge.exposeInMainWorld('hardwareAPI', hardwareAPI)
contextBridge.exposeInMainWorld('configAPI', configAPI)
contextBridge.exposeInMainWorld('reporterAPI', reporterAPI)
contextBridge.exposeInMainWorld('encryptionAPI', encryptionAPI)
contextBridge.exposeInMainWorld('appAPI', appAPI)
contextBridge.exposeInMainWorld('eventAPI', eventAPI)

declare global {
  interface Window {
    hardwareAPI: typeof hardwareAPI
    configAPI: typeof configAPI
    reporterAPI: typeof reporterAPI
    encryptionAPI: typeof encryptionAPI
    appAPI: typeof appAPI
    eventAPI: typeof eventAPI
  }
}

export type HardwareAPI = typeof hardwareAPI
export type ConfigAPI = typeof configAPI
export type ReporterAPI = typeof reporterAPI
export type EncryptionAPI = typeof encryptionAPI
export type AppAPI = typeof appAPI
export type EventAPI = typeof eventAPI
