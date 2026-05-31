export interface Room {
  id: string
  name: string
  location: string
}

export interface SensorData {
  device_id: string
  room_id: string
  sensor_type: string
  value: number
  unit: string
  timestamp: string
  metadata?: Record<string, any>
}

export interface AlertMessage {
  alert_id: string
  room_id: string
  device_id: string
  alert_type: string
  level: 'info' | 'warning' | 'critical' | 'emergency'
  message: string
  value?: number
  threshold?: number
  timestamp: string
  acknowledged: boolean
}

export interface DeviceState {
  device_id: string
  room_id: string
  status: string
  breaker_status: 'closed' | 'tripped'
  last_trip_time?: string
  trip_count: number
  config: Record<string, any>
}

export interface ControlCommand {
  command_id: string
  room_id: string
  device_id: string
  command_type: 'trip' | 'close' | 'config' | 'reset'
  params: Record<string, any>
  issued_by: string
  timestamp: string
}

export interface TableDataItem {
  room_id: string
  room_name: string
  device_id: string
  sensor_type: string
  value: number
  unit: string
  timestamp: string
  status: 'normal' | 'warning' | 'critical' | 'unknown'
}

export interface AggregateRoomData {
  device_count: number
  devices: Record<string, SensorData>
}

export interface AggregateData {
  rooms: Record<string, AggregateRoomData>
  summary: {
    total_devices: number
    total_readings: number
    last_update: string
  }
}

export interface LoadPrediction {
  room_id: string
  device_id: string
  current_value: number
  predictions: {
    ma: number[]
    ema: number[]
    linear_regression: number[]
    ensemble: number[]
  }
  trend: {
    slope: number
    direction: 'increasing' | 'decreasing' | 'stable'
  }
  alerts: {
    peak_warning: boolean
    overload_warning: boolean
    peak_threshold: number
    overload_threshold: number
  }
  prediction_timestamp: string
  confidence: number
}

export interface LoadSummary {
  room_id: string
  total_load: number
  avg_load: number
  max_load: number
  device_count: number
  load_level: 'normal' | 'warning' | 'critical'
  timestamp: string
}

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical' | 'emergency'
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'escalated'
export type TaskType = 'inspection' | 'maintenance' | 'repair' | 'calibration' | 'cleaning' | 'investigation'

export interface MaintenanceTask {
  task_id: string
  task_type: TaskType
  title: string
  description: string
  room_id: string
  device_id: string
  priority: TaskPriority
  status: TaskStatus
  assigned_to: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  due_at: string
  estimated_duration_minutes: number
  notes: Array<{
    timestamp: string
    content: string
    type: string
  }>
  escalation_count: number
}

export interface MaintenanceWorker {
  worker_id: string
  name: string
  skills: string[]
  phone: string | null
  email: string | null
  current_task: string | null
  tasks_completed: number
  availability: boolean
  online: boolean
}

export interface AggregationStats {
  count: number
  mean: number
  std_dev: number
  min: number
  max: number
  range: number
  first_timestamp: string
  last_timestamp: string
  last_value: number
}

export interface TimeWindowBucket {
  timestamp: string
  ts: number
  count: number
  mean: number
  min: number
  max: number
  sum: number
}

export interface TimeWindowAggregation {
  room_id: string
  device_id: string
  sensor_type: string
  window_seconds: number
  buckets: TimeWindowBucket[]
  total_count: number
  bucket_count: number
  aggregated_at: string
}

export interface TrendAnalysis {
  room_id: string
  device_id: string
  sensor_type: string
  trend: 'rising' | 'falling' | 'stable' | 'insufficient_data'
  change_percent: number
  start_value: number
  end_value: number
  window_seconds: number
}

export interface AnomalyDataPoint {
  timestamp: string
  ts: number
  value: number
  z_score: number
  deviation_from_mean: number
}
