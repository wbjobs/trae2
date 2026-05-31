import { create } from 'zustand'

interface Device {
  device_id: string
  device_name: string
  device_type: string
  location: string
  status: string
  anomaly_count: number
  record_count: number
  last_update: string
}

interface OverviewData {
  total_devices: number
  total_metrics: number
  total_records: number
  anomaly_count: number
  anomaly_rate: number
  active_devices: number
  warning_devices: number
}

interface DashboardState {
  selectedDevice: string | null
  selectedMetric: string | null
  timeRange: number
  devices: Device[]
  overview: OverviewData | null
  isLoading: boolean
  setSelectedDevice: (device: string | null) => void
  setSelectedMetric: (metric: string | null) => void
  setTimeRange: (hours: number) => void
  setDevices: (devices: Device[]) => void
  setOverview: (overview: OverviewData) => void
  setLoading: (loading: boolean) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedDevice: null,
  selectedMetric: null,
  timeRange: 24,
  devices: [],
  overview: null,
  isLoading: false,
  setSelectedDevice: (device) => set({ selectedDevice: device }),
  setSelectedMetric: (metric) => set({ selectedMetric: metric }),
  setTimeRange: (hours) => set({ timeRange: hours }),
  setDevices: (devices) => set({ devices }),
  setOverview: (overview) => set({ overview }),
  setLoading: (loading) => set({ isLoading: loading })
}))
