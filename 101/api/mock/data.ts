import type {
  SignalSource,
  SignalTarget,
  RouteConfig,
  RouteHistory,
  AlertRule,
  AlertEvent,
  TimeSeriesDataPoint,
} from '../../shared/types'

export const mockSignals: SignalSource[] = [
  {
    id: 'S001',
    name: 'CCTV-1 高清',
    type: 'video',
    protocol: 'ST2110',
    status: 'active',
    bandwidth: 12.5,
    latency: 18,
    packetLoss: 0.02,
    targetIds: ['T001', 'T003'],
  },
  {
    id: 'S002',
    name: 'CCTV-2 高清',
    type: 'video',
    protocol: 'ST2110',
    status: 'active',
    bandwidth: 12.3,
    latency: 22,
    packetLoss: 0.01,
    targetIds: ['T002', 'T004'],
  },
  {
    id: 'S003',
    name: 'CCTV-5 体育',
    type: 'video',
    protocol: 'ST2110',
    status: 'active',
    bandwidth: 15.8,
    latency: 15,
    packetLoss: 0.03,
    targetIds: ['T001', 'T005'],
  },
  {
    id: 'S004',
    name: 'Hunan TV 高清',
    type: 'video',
    protocol: 'SDI',
    status: 'standby',
    bandwidth: 0,
    latency: 0,
    packetLoss: 0,
    targetIds: ['T003'],
  },
  {
    id: 'S005',
    name: 'Zhejiang TV 高清',
    type: 'video',
    protocol: 'SDI',
    status: 'active',
    bandwidth: 11.2,
    latency: 25,
    packetLoss: 0.05,
    targetIds: ['T002'],
  },
  {
    id: 'S006',
    name: '东方卫视 高清',
    type: 'video',
    protocol: 'NDI',
    status: 'active',
    bandwidth: 8.5,
    latency: 12,
    packetLoss: 0.01,
    targetIds: ['T004', 'T006'],
  },
  {
    id: 'S007',
    name: 'AUDIO-主声道',
    type: 'audio',
    protocol: 'ST2110',
    status: 'active',
    bandwidth: 2.1,
    latency: 5,
    packetLoss: 0,
    targetIds: ['T001', 'T002'],
  },
  {
    id: 'S008',
    name: 'AUDIO-备声道',
    type: 'audio',
    protocol: 'ST2110',
    status: 'standby',
    bandwidth: 0,
    latency: 0,
    packetLoss: 0,
    targetIds: ['T001'],
  },
  {
    id: 'S009',
    name: '卫星信号-1',
    type: 'video',
    protocol: 'SDI',
    status: 'error',
    bandwidth: 0,
    latency: 0,
    packetLoss: 0,
    targetIds: ['T005'],
  },
  {
    id: 'S010',
    name: '数据广播流',
    type: 'data',
    protocol: 'ST2110',
    status: 'active',
    bandwidth: 1.5,
    latency: 8,
    packetLoss: 0.001,
    targetIds: ['T006'],
  },
  {
    id: 'S011',
    name: '北京卫视 高清',
    type: 'video',
    protocol: 'ST2110',
    status: 'active',
    bandwidth: 12.0,
    latency: 20,
    packetLoss: 0.015,
    targetIds: ['T003'],
  },
  {
    id: 'S012',
    name: '广东卫视 高清',
    type: 'video',
    protocol: 'SDI',
    status: 'offline',
    bandwidth: 0,
    latency: 0,
    packetLoss: 0,
    targetIds: ['T004'],
  },
]

export const mockTargets: SignalTarget[] = [
  { id: 'T001', name: '编码器-主路', type: 'encoder', status: 'online', sourceId: 'S001', maxBandwidth: 30 },
  { id: 'T002', name: '编码器-备路', type: 'encoder', status: 'online', sourceId: 'S002', maxBandwidth: 30 },
  { id: 'T003', name: '解码器-播出1', type: 'decoder', status: 'online', sourceId: 'S001', maxBandwidth: 20 },
  { id: 'T004', name: '解码器-播出2', type: 'decoder', status: 'online', sourceId: 'S002', maxBandwidth: 20 },
  { id: 'T005', name: '矩阵路由器-A', type: 'router', status: 'online', sourceId: 'S003', maxBandwidth: 50 },
  { id: 'T006', name: '监控墙-主屏', type: 'monitor', status: 'online', sourceId: 'S006', maxBandwidth: 15 },
]

export const mockRoutes: RouteConfig[] = [
  { id: 'R001', sourceId: 'S001', targetId: 'T001', bandwidth: 12.5, priority: 1, isActive: true, createdAt: '2026-05-20T08:00:00Z' },
  { id: 'R002', sourceId: 'S001', targetId: 'T003', bandwidth: 12.5, priority: 1, isActive: true, createdAt: '2026-05-20T08:00:00Z' },
  { id: 'R003', sourceId: 'S002', targetId: 'T002', bandwidth: 12.3, priority: 2, isActive: true, createdAt: '2026-05-20T08:05:00Z' },
  { id: 'R004', sourceId: 'S002', targetId: 'T004', bandwidth: 12.3, priority: 2, isActive: true, createdAt: '2026-05-20T08:05:00Z' },
  { id: 'R005', sourceId: 'S003', targetId: 'T001', bandwidth: 15.8, priority: 3, isActive: true, createdAt: '2026-05-20T09:00:00Z' },
  { id: 'R006', sourceId: 'S003', targetId: 'T005', bandwidth: 15.8, priority: 3, isActive: true, createdAt: '2026-05-20T09:00:00Z' },
  { id: 'R007', sourceId: 'S005', targetId: 'T002', bandwidth: 11.2, priority: 4, isActive: true, createdAt: '2026-05-20T10:00:00Z' },
  { id: 'R008', sourceId: 'S006', targetId: 'T004', bandwidth: 8.5, priority: 5, isActive: true, createdAt: '2026-05-20T11:00:00Z' },
  { id: 'R009', sourceId: 'S006', targetId: 'T006', bandwidth: 8.5, priority: 5, isActive: true, createdAt: '2026-05-20T11:00:00Z' },
  { id: 'R010', sourceId: 'S007', targetId: 'T001', bandwidth: 2.1, priority: 1, isActive: true, createdAt: '2026-05-20T08:00:00Z' },
  { id: 'R011', sourceId: 'S007', targetId: 'T002', bandwidth: 2.1, priority: 1, isActive: true, createdAt: '2026-05-20T08:00:00Z' },
  { id: 'R012', sourceId: 'S010', targetId: 'T006', bandwidth: 1.5, priority: 6, isActive: true, createdAt: '2026-05-20T12:00:00Z' },
  { id: 'R013', sourceId: 'S011', targetId: 'T003', bandwidth: 12.0, priority: 4, isActive: true, createdAt: '2026-05-27T08:00:00Z' },
]

export const mockAlertRules: AlertRule[] = [
  {
    id: 'AR001',
    name: '黑帧检测',
    type: 'black_frame',
    threshold: 5,
    duration: 3,
    severity: 'critical',
    enabled: true,
    action: 'alert_and_switch',
  },
  {
    id: 'AR002',
    name: '静帧检测',
    type: 'freeze_frame',
    threshold: 3,
    duration: 5,
    severity: 'warning',
    enabled: true,
    action: 'alert',
  },
  {
    id: 'AR003',
    name: '静音检测',
    type: 'silence',
    threshold: -40,
    duration: 10,
    severity: 'critical',
    enabled: true,
    action: 'alert_and_switch',
  },
  {
    id: 'AR004',
    name: '带宽异常',
    type: 'bandwidth_anomaly',
    threshold: 50,
    duration: 5,
    severity: 'warning',
    enabled: true,
    action: 'alert',
  },
  {
    id: 'AR005',
    name: '延迟告警',
    type: 'latency_anomaly',
    threshold: 100,
    duration: 3,
    severity: 'warning',
    enabled: true,
    action: 'alert',
  },
  {
    id: 'AR006',
    name: '丢包率告警',
    type: 'packet_loss',
    threshold: 1,
    duration: 10,
    severity: 'critical',
    enabled: true,
    action: 'alert_and_switch',
  },
]

export const mockAlertEvents: AlertEvent[] = [
  {
    id: 'AE001',
    ruleId: 'AR006',
    signalId: 'S009',
    type: 'packet_loss',
    severity: 'critical',
    message: '卫星信号-1 丢包率超过阈值',
    value: 5.2,
    threshold: 1,
    timestamp: '2026-05-28T16:30:00Z',
    resolved: false,
  },
  {
    id: 'AE002',
    ruleId: 'AR005',
    signalId: 'S005',
    type: 'latency_anomaly',
    severity: 'warning',
    message: 'Zhejiang TV 延迟偏高',
    value: 85,
    threshold: 100,
    timestamp: '2026-05-28T16:15:00Z',
    resolved: true,
  },
  {
    id: 'AE003',
    ruleId: 'AR004',
    signalId: 'S003',
    type: 'bandwidth_anomaly',
    severity: 'warning',
    message: 'CCTV-5 体育 带宽波动',
    value: 45,
    threshold: 50,
    timestamp: '2026-05-28T15:45:00Z',
    resolved: true,
  },
]

export const mockRouteHistory: RouteHistory[] = [
  {
    id: 'RH001',
    routeId: 'R001',
    fromSourceId: 'S004',
    toSourceId: 'S001',
    reason: 'manual',
    operator: 'admin',
    timestamp: '2026-05-28T10:00:00Z',
  },
  {
    id: 'RH002',
    routeId: 'R003',
    fromSourceId: 'S012',
    toSourceId: 'S002',
    reason: 'auto-failover',
    operator: 'system',
    timestamp: '2026-05-28T08:30:00Z',
  },
]

export function generateTimeSeriesData(
  baseValue: number,
  variance: number,
  hours: number = 1,
  intervalMs: number = 60000
): TimeSeriesDataPoint[] {
  const now = Date.now()
  const points: TimeSeriesDataPoint[] = []
  const count = Math.floor((hours * 3600000) / intervalMs)

  for (let i = 0; i < count; i++) {
    const time = new Date(now - (count - i) * intervalMs)
    const noise = (Math.random() - 0.5) * variance
    const trend = Math.sin(i / 20) * variance * 0.5
    let value = baseValue + noise + trend
    if (value < 0) value = 0

    points.push({
      time: time.toISOString(),
      value: Math.round(value * 100) / 100,
    })
  }

  return points
}
