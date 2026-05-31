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

export interface AppConfig {
  app_name: string
  app_version: string
  device_id: string
  devices: DeviceConfig[]
  collection_rules: CollectionRule[]
  reporters: ReporterConfig[]
  logging: LoggingConfig
  extra: Record<string, string>
  created_at: string
  updated_at: string
}

export interface DeviceConfig {
  device_id: string
  name: string
  hardware_type: string
  enabled: boolean
  poll_interval_ms: number
  settings: Record<string, string>
}

export interface CollectionRule {
  rule_id: string
  name: string
  enabled: boolean
  hardware_types: string[]
  collection_interval_ms: number
  timeout_ms: number
  max_retries: number
  filters: string[]
  aggregate: boolean
}

export interface ReporterConfig {
  reporter_id: string
  name: string
  enabled: boolean
  endpoint_url: string
  auth_token?: string
  encryption_key?: string
  batch_size: number
  max_interval_ms: number
  retry_count: number
  retry_interval_ms: number
  timeout_ms: number
  use_tls: boolean
  tls_cert_path?: string
  headers: Record<string, string>
}

export interface LoggingConfig {
  level: string
  file_path?: string
  max_file_size_mb: number
  max_files: number
  console_output: boolean
}

export type HardwareType = 'Cpu' | 'Memory' | 'Disk' | 'Network' | 'Motherboard' | 'Sensor' | 'ExternalDevice' | 'Unknown'

export type SensorStatus = 'Normal' | 'Warning' | 'Critical' | 'Unknown'

export interface HistoryRecord {
  timestamp: string
  cpu_usage: number
  memory_usage: number
  disk_usage: number
}

export type AlertLevel = 'Info' | 'Warning' | 'Critical'

export interface AlertRule {
  rule_id: string
  name: string
  hardware_type: string
  metric: string
  operator: string
  threshold: number
  duration_secs: number
  enabled: boolean
  level: AlertLevel
}

export interface AlertEvent {
  rule_id: string
  rule_name: string
  hardware_type: string
  metric: string
  current_value: number
  threshold: number
  level: AlertLevel
  message: string
  triggered_at: string
}

export interface ScheduleConfig {
  enabled: boolean
  start_time: string
  stop_time: string
  weekdays: number[]
  interval_ms: number
}
