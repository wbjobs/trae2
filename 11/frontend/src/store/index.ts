import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { LogEntry, LogFilter, TraceLink, AnomalyCluster, DashboardConfig, DataSource } from '../types'

interface AppState {
  logs: LogEntry[]
  logsLoading: boolean
  logsTotal: number
  logsPage: number
  logsPageSize: number
  logsHasMore: boolean
  logsTook?: number
  currentLog: LogEntry | null
  currentFilter: LogFilter
  traceResult: TraceLink | null
  traceLoading: boolean
  anomalyClusters: AnomalyCluster[]
  clustersLoading: boolean
  dashboards: DashboardConfig[]
  currentDashboard: DashboardConfig | null
  dataSources: DataSource[]
  stats: Record<string, number>

  setLogs: (logs: LogEntry[], total: number, hasMore: boolean, took?: number) => void
  setLogsLoading: (loading: boolean) => void
  setLogsPage: (page: number) => void
  setLogsPageSize: (pageSize: number) => void
  setCurrentLog: (log: LogEntry | null) => void
  setCurrentFilter: (filter: Partial<LogFilter>) => void
  setTraceResult: (trace: TraceLink | null) => void
  setTraceLoading: (loading: boolean) => void
  setAnomalyClusters: (clusters: AnomalyCluster[]) => void
  setClustersLoading: (loading: boolean) => void
  setDashboards: (dashboards: DashboardConfig[]) => void
  setCurrentDashboard: (dashboard: DashboardConfig | null) => void
  setDataSources: (sources: DataSource[]) => void
  setStats: (stats: Record<string, number>) => void
  resetFilter: () => void
  resetLogs: () => void
}

const defaultFilter: LogFilter = {
  level: [],
  os: [],
  startTime: '',
  endTime: '',
  keyword: '',
  page: 1,
  pageSize: 20
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    logs: [],
    logsLoading: false,
    logsTotal: 0,
    logsPage: 1,
    logsPageSize: 20,
    logsHasMore: false,
    logsTook: undefined,
    currentLog: null,
    currentFilter: { ...defaultFilter },
    traceResult: null,
    traceLoading: false,
    anomalyClusters: [],
    clustersLoading: false,
    dashboards: [],
    currentDashboard: null,
    dataSources: [],
    stats: {},

    setLogs: (logs, total, hasMore, took) =>
      set((state) => {
        state.logs = logs
        state.logsTotal = total
        state.logsHasMore = hasMore
        state.logsTook = took
      }),

    setLogsLoading: (loading) =>
      set((state) => {
        state.logsLoading = loading
      }),

    setLogsPage: (page) =>
      set((state) => {
        state.logsPage = page
      }),

    setLogsPageSize: (pageSize) =>
      set((state) => {
        state.logsPageSize = pageSize
      }),

    setCurrentLog: (log) =>
      set((state) => {
        state.currentLog = log
      }),

    setCurrentFilter: (filter) =>
      set((state) => {
        state.currentFilter = { ...state.currentFilter, ...filter }
      }),

    setTraceResult: (trace) =>
      set((state) => {
        state.traceResult = trace
      }),

    setTraceLoading: (loading) =>
      set((state) => {
        state.traceLoading = loading
      }),

    setAnomalyClusters: (clusters) =>
      set((state) => {
        state.anomalyClusters = clusters
      }),

    setClustersLoading: (loading) =>
      set((state) => {
        state.clustersLoading = loading
      }),

    setDashboards: (dashboards) =>
      set((state) => {
        state.dashboards = dashboards
      }),

    setCurrentDashboard: (dashboard) =>
      set((state) => {
        state.currentDashboard = dashboard
      }),

    setDataSources: (sources) =>
      set((state) => {
        state.dataSources = sources
      }),

    setStats: (stats) =>
      set((state) => {
        state.stats = stats
      }),

    resetFilter: () =>
      set((state) => {
        state.currentFilter = { ...defaultFilter }
      }),

    resetLogs: () =>
      set((state) => {
        state.logs = []
        state.logsTotal = 0
        state.logsPage = 1
        state.logsHasMore = false
        state.logsTook = undefined
      })
  }))
)