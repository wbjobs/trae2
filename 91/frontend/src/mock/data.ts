import type { Device, SignalingMessage, ThroughputData, SignalingDistribution, MetricsData, DeviceMetrics } from '@/types'

export const mockDevices: Device[] = [
  {
    id: 'dev-001',
    name: '信令网关-SG01',
    ip: '192.168.1.101',
    type: '信令网关',
    status: 'online',
    location: '机房A-机架1',
    lastHeartbeat: '2024-01-15 14:30:25',
    signalingCount: 15420,
    cpuUsage: 45,
    memoryUsage: 62
  },
  {
    id: 'dev-002',
    name: '媒体网关-MG01',
    ip: '192.168.1.102',
    type: '媒体网关',
    status: 'online',
    location: '机房A-机架2',
    lastHeartbeat: '2024-01-15 14:30:22',
    signalingCount: 8930,
    cpuUsage: 38,
    memoryUsage: 55
  },
  {
    id: 'dev-003',
    name: '软交换机-SS01',
    ip: '192.168.1.103',
    type: '软交换机',
    status: 'warning',
    location: '机房B-机架1',
    lastHeartbeat: '2024-01-15 14:30:18',
    signalingCount: 22150,
    cpuUsage: 78,
    memoryUsage: 85
  },
  {
    id: 'dev-004',
    name: '路由器-RT01',
    ip: '192.168.1.104',
    type: '路由器',
    status: 'online',
    location: '机房B-机架2',
    lastHeartbeat: '2024-01-15 14:30:20',
    signalingCount: 5680,
    cpuUsage: 25,
    memoryUsage: 42
  },
  {
    id: 'dev-005',
    name: '防火墙-FW01',
    ip: '192.168.1.105',
    type: '防火墙',
    status: 'error',
    location: '机房C-机架1',
    lastHeartbeat: '2024-01-15 14:25:10',
    signalingCount: 3250,
    cpuUsage: 92,
    memoryUsage: 88
  },
  {
    id: 'dev-006',
    name: '信令网关-SG02',
    ip: '192.168.1.106',
    type: '信令网关',
    status: 'offline',
    location: '机房C-机架2',
    lastHeartbeat: '2024-01-15 12:15:30',
    signalingCount: 0,
    cpuUsage: 0,
    memoryUsage: 0
  }
]

export function generateThroughputData(hours: number = 1): ThroughputData[] {
  const data: ThroughputData[] = []
  const now = new Date()
  const interval = hours <= 1 ? 60000 : 300000
  const count = hours <= 1 ? 60 : Math.floor((hours * 3600000) / interval)

  for (let i = count - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * interval)
    const count = Math.floor(Math.random() * 500) + 200
    const success = Math.floor(count * (0.95 + Math.random() * 0.04))
    data.push({
      timestamp: time.toISOString().replace('T', ' ').substring(0, 19),
      count,
      success,
      failed: count - success
    })
  }
  return data
}

export const mockDistribution: SignalingDistribution[] = [
  { type: 'SIP', count: 25600, percentage: 42.5 },
  { type: 'H.323', count: 12800, percentage: 21.2 },
  { type: 'MGCP', count: 8500, percentage: 14.1 },
  { type: 'MEGACO', count: 5200, percentage: 8.6 },
  { type: 'SCTP', count: 4800, percentage: 8.0 },
  { type: 'Diameter', count: 2100, percentage: 3.5 },
  { type: 'RADIUS', count: 1200, percentage: 2.0 },
  { type: 'Other', count: 60, percentage: 0.1 }
]

export function generateLatestMessages(count: number = 20): SignalingMessage[] {
  const methods = ['INVITE', 'ACK', 'BYE', 'REGISTER', 'OPTIONS', 'INFO', 'NOTIFY', 'UPDATE']
  const types: SignalingMessage['type'][] = ['SIP', 'H.323', 'MGCP', 'MEGACO', 'SCTP', 'Diameter', 'RADIUS', 'Other']
  const statuses: SignalingMessage['status'][] = ['success', 'success', 'success', 'success', 'failed', 'pending']
  const devices = mockDevices.filter(d => d.status !== 'offline')

  const messages: SignalingMessage[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const timestamp = now - i * 3000 + Math.floor(Math.random() * 1000)
    const device = devices[Math.floor(Math.random() * devices.length)]
    const type = types[Math.floor(Math.random() * types.length)]
    const status = statuses[Math.floor(Math.random() * statuses.length)]

    messages.push({
      id: `msg-${timestamp}-${i}`,
      deviceId: device.id,
      deviceName: device.name,
      type,
      method: methods[Math.floor(Math.random() * methods.length)],
      from: `sip:user${Math.floor(Math.random() * 1000)}@domain.com`,
      to: `sip:user${Math.floor(Math.random() * 1000)}@domain.com`,
      timestamp,
      status,
      duration: status !== 'pending' ? Math.floor(Math.random() * 200) + 10 : undefined,
      payload: {
        callId: `call-${timestamp}-${i}`,
        cseq: Math.floor(Math.random() * 10000),
        userAgent: 'SoftSwitch v2.3.1'
      }
    })
  }
  return messages
}

export function generateMetricsData(count: number = 60): MetricsData[] {
  const data: MetricsData[] = []
  const now = new Date()

  for (let i = count - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000)
    const successRate = 95 + Math.random() * 4.5
    const errorRate = 100 - successRate
    data.push({
      timestamp: time.toISOString().replace('T', ' ').substring(0, 19),
      totalSignaling: Math.floor(Math.random() * 5000) + 1000,
      successRate: Number(successRate.toFixed(2)),
      avgLatency: Number((Math.random() * 80 + 20).toFixed(2)),
      errorRate: Number(errorRate.toFixed(2))
    })
  }
  return data
}

export const mockDeviceMetrics: DeviceMetrics[] = mockDevices.map(d => ({
  deviceId: d.id,
  deviceName: d.name,
  signalingCount: d.signalingCount,
  successCount: Math.floor(d.signalingCount * 0.97),
  failedCount: Math.floor(d.signalingCount * 0.03),
  avgLatency: Math.floor(Math.random() * 60) + 15
}))

export function generateTraceQueryResult(page: number = 1, pageSize: number = 20) {
  const allMessages = generateLatestMessages(100)
  const start = (page - 1) * pageSize
  const end = start + pageSize
  return {
    data: allMessages.slice(start, end),
    total: allMessages.length,
    page,
    pageSize
  }
}
