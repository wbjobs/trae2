import type { RouteConfig, RouteHistory, RouteSwitchRequest, RouteSwitchResponse, TopologyNode, TopologyEdge, PriorityScheduleResult, StreamInterruptEvent, SignalSource } from '../../shared/types'
import { rabbitMQ, QUEUES, EXCHANGES } from '../services/rabbitmq'
import { influxService } from '../services/influx'
import { mockRoutes, mockRouteHistory, mockSignals, mockTargets } from '../mock/data'
import { Point } from '@influxdata/influxdb-client'
import { timestamp } from '../utils/timestamp'

const routes: Map<string, RouteConfig> = new Map(mockRoutes.map((r) => [r.id, { ...r }]))
const routeHistory: RouteHistory[] = [...mockRouteHistory]
const switchingRoutes: Set<string> = new Set()
const bandwidthTransition: Map<string, { from: number; to: number; startTime: number; duration: number }> = new Map()
const signalStatusCache: Map<string, { status: string; bandwidth: number; latency: number; packetLoss: number }> = new Map(
  mockSignals.map((s) => [s.id, { status: s.status, bandwidth: s.bandwidth, latency: s.latency, packetLoss: s.packetLoss }])
)

export type RouteUpdateCallback = (routes: RouteConfig[]) => void
export type InterruptCallback = (event: StreamInterruptEvent) => void

let interruptCallback: InterruptCallback | null = null

export function startRoutingWorker(onRouteUpdate: RouteUpdateCallback) {
  console.log('[Routing] Worker started')

  rabbitMQ.subscribe(QUEUES.ROUTE_CMD, async (msg) => {
    console.log('[Routing] Command received:', msg.type)

    if (msg.type === 'route.switch') {
      const payload = msg.payload as RouteSwitchRequest
      const result = await handleRouteSwitch(payload, onRouteUpdate)
      rabbitMQ.publish(EXCHANGES.EVT, 'route.switched', {
        type: 'route_switched',
        payload: result,
        timestamp: new Date().toISOString(),
      })
      onRouteUpdate(Array.from(routes.values()))
    } else if (msg.type === 'route.bandwidth.update') {
      const { routeId, bandwidth } = msg.payload as { routeId: string; bandwidth: number }
      const route = routes.get(routeId)
      if (route) {
        route.bandwidth = bandwidth
        onRouteUpdate(Array.from(routes.values()))
      }
    } else if (msg.type === 'route.priority.update') {
      const { routeId, priority } = msg.payload as { routeId: string; priority: number }
      const route = routes.get(routeId)
      if (route) {
        route.priority = priority
        const results = scheduleByPriority()
        rabbitMQ.publish(EXCHANGES.EVT, 'route.scheduled', {
          type: 'priority_scheduled',
          payload: results,
          timestamp: new Date().toISOString(),
        })
        onRouteUpdate(Array.from(routes.values()))
      }
    } else if (msg.type === 'route.priority.schedule') {
      const results = scheduleByPriority()
      rabbitMQ.publish(EXCHANGES.EVT, 'route.scheduled', {
        type: 'priority_scheduled',
        payload: results,
        timestamp: new Date().toISOString(),
      })
      onRouteUpdate(Array.from(routes.values()))
    }
  })
}

export function setInterruptCallback(cb: InterruptCallback) {
  interruptCallback = cb
}

export function updateSignalStatusCache(signalId: string, data: { status?: string; bandwidth?: number; latency?: number; packetLoss?: number }) {
  const cached = signalStatusCache.get(signalId)
  if (!cached) return
  const previousStatus = cached.status
  if (data.status !== undefined) cached.status = data.status
  if (data.bandwidth !== undefined) cached.bandwidth = data.bandwidth
  if (data.latency !== undefined) cached.latency = data.latency
  if (data.packetLoss !== undefined) cached.packetLoss = data.packetLoss

  const interruptReason = detectStreamInterrupt(signalId, previousStatus, cached)
  if (interruptReason) {
    handleStreamInterrupt(signalId, interruptReason, previousStatus)
  }
}

function detectStreamInterrupt(signalId: string, previousStatus: string, current: { status: string; bandwidth: number; latency: number; packetLoss: number }): StreamInterruptEvent['reason'] | null {
  if (current.status === 'offline' && previousStatus !== 'offline') return 'offline'
  if (current.status === 'error' && previousStatus !== 'error') return 'error'
  if (previousStatus === 'active' && current.bandwidth <= 0.1) return 'zero_bandwidth'
  if (previousStatus === 'active' && current.latency > 200) return 'high_latency'
  if (previousStatus === 'active' && current.packetLoss > 5) return 'high_packet_loss'
  return null
}

function handleStreamInterrupt(signalId: string, reason: StreamInterruptEvent['reason'], previousStatus: string) {
  const signal = mockSignals.find((s) => s.id === signalId)
  if (!signal) return

  const routesUsingSignal = Array.from(routes.values()).filter((r) => r.sourceId === signalId && r.isActive)
  if (routesUsingSignal.length === 0) return

  const backup = findBestBackupSource(signalId, signal.type, signal.protocol)

  const event: StreamInterruptEvent = {
    signalId,
    signalName: signal.name,
    reason,
    previousStatus: previousStatus as StreamInterruptEvent['previousStatus'],
    backupSourceId: backup?.id || null,
    backupSourceName: backup?.name || null,
    switchInitiated: false,
    timestamp: new Date(timestamp.now()).toISOString(),
  }

  if (backup) {
    for (const route of routesUsingSignal) {
      if (switchingRoutes.has(route.id)) continue
      requestRouteSwitch({
        routeId: route.id,
        newSourceId: backup.id,
        reason: 'auto-failover',
      })
      event.switchInitiated = true
    }
  }

  const point = new Point('stream_interrupts')
    .tag('signalId', signalId)
    .tag('reason', reason)
    .tag('backupSourceId', backup?.id || 'none')
    .booleanField('switchInitiated', event.switchInitiated)
    .timestamp(new Date(timestamp.now()))

  influxService.writePoint(point)

  if (interruptCallback) {
    interruptCallback(event)
  }
}

function findBestBackupSource(
  excludeId: string,
  signalType: string,
  preferredProtocol: string
): SignalSource | null {
  const candidates = mockSignals
    .filter((s) => s.id !== excludeId)
    .filter((s) => s.type === signalType)
    .filter((s) => s.status === 'standby' || s.status === 'active')
    .filter((s) => !Array.from(routes.values()).some((r) => r.sourceId === s.id && r.priority <= 2))

  if (candidates.length === 0) return null

  const scored = candidates.map((s) => {
    let score = 0
    if (s.status === 'standby') score += 50
    if (s.protocol === preferredProtocol) score += 30
    score += Math.max(0, 30 - s.latency)
    score += Math.max(0, s.bandwidth * 2)
    return { signal: s, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].signal
}

export function scheduleByPriority(): PriorityScheduleResult[] {
  const allRoutes = Array.from(routes.values()).filter((r) => r.isActive)
  const routesByTarget = new Map<string, RouteConfig[]>()

  allRoutes.forEach((r) => {
    const list = routesByTarget.get(r.targetId) || []
    list.push(r)
    routesByTarget.set(r.targetId, list)
  })

  const results: PriorityScheduleResult[] = []

  routesByTarget.forEach((targetRoutes, targetId) => {
    const target = mockTargets.find((t) => t.id === targetId)
    const maxBw = target?.maxBandwidth || 30

    const sorted = [...targetRoutes].sort((a, b) => a.priority - b.priority)

    let remainingBw = maxBw
    const allocated: PriorityScheduleResult['allocated'] = []

    for (const route of sorted) {
      const requested = route.bandwidth
      const canAllocate = Math.min(requested, remainingBw)
      const preempted = canAllocate < requested

      if (preempted) {
        route.bandwidth = Math.round(canAllocate * 100) / 100
        route.isActive = canAllocate > 0.5
      }

      remainingBw -= canAllocate

      allocated.push({
        routeId: route.id,
        priority: route.priority,
        bandwidth: Math.round(canAllocate * 100) / 100,
        preempted,
      })
    }

    results.push({
      targetId,
      maxBandwidth: maxBw,
      allocated,
      totalAllocated: Math.round((maxBw - remainingBw) * 100) / 100,
      overBudget: remainingBw < 0,
    })
  })

  return results
}

async function handleRouteSwitch(
  request: RouteSwitchRequest,
  onRouteUpdate: RouteUpdateCallback
): Promise<RouteSwitchResponse> {
  const route = routes.get(request.routeId)
  if (!route) {
    return {
      success: false,
      message: 'Route not found',
      previousState: {} as RouteConfig,
      newState: {} as RouteConfig,
    }
  }

  if (switchingRoutes.has(request.routeId)) {
    return {
      success: false,
      message: 'Route switch already in progress',
      previousState: { ...route },
      newState: { ...route },
    }
  }

  const newSource = mockSignals.find((s) => s.id === request.newSourceId)
  if (!newSource) {
    return {
      success: false,
      message: 'Target source not found',
      previousState: { ...route },
      newState: { ...route },
    }
  }

  if (newSource.status !== 'active' && newSource.status !== 'standby') {
    return {
      success: false,
      message: `Target source is not available (status: ${newSource.status})`,
      previousState: { ...route },
      newState: { ...route },
    }
  }

  switchingRoutes.add(request.routeId)
  const previousState = { ...route }

  const oldBandwidth = route.bandwidth
  const newBandwidth = newSource.bandwidth || previousState.bandwidth

  bandwidthTransition.set(request.routeId, {
    from: oldBandwidth,
    to: newBandwidth,
    startTime: Date.now(),
    duration: 2000,
  })

  const sourceSwitchDelay = request.reason === 'auto-failover' ? 300 : 800
  await new Promise((resolve) => setTimeout(resolve, sourceSwitchDelay))
  route.sourceId = request.newSourceId

  const transitionSteps = request.reason === 'auto-failover' ? 6 : 10
  const stepDuration = (request.reason === 'auto-failover' ? 1200 : 2000) / transitionSteps
  for (let i = 1; i <= transitionSteps; i++) {
    await new Promise((resolve) => setTimeout(resolve, stepDuration))
    const progress = i / transitionSteps
    const easeProgress = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2
    route.bandwidth = Math.round((oldBandwidth + (newBandwidth - oldBandwidth) * easeProgress) * 100) / 100
    onRouteUpdate?.(Array.from(routes.values()))
  }

  route.bandwidth = newBandwidth
  bandwidthTransition.delete(request.routeId)
  switchingRoutes.delete(request.routeId)

  const opTs = timestamp.now()
  const history: RouteHistory = {
    id: `RH${opTs}`,
    routeId: request.routeId,
    fromSourceId: previousState.sourceId,
    toSourceId: request.newSourceId,
    reason: request.reason,
    operator: request.reason === 'auto-failover' ? 'system' : 'admin',
    timestamp: new Date(opTs).toISOString(),
  }
  routeHistory.unshift(history)

  const point = new Point('route_operations')
    .tag('routeId', request.routeId)
    .tag('fromSourceId', previousState.sourceId)
    .tag('toSourceId', request.newSourceId)
    .tag('reason', request.reason)
    .tag('operator', history.operator)
    .tag('switchPhase', 'completed')
    .timestamp(new Date(opTs))
    .floatField('bandwidth', route.bandwidth)
    .intField('priority', route.priority)

  await influxService.writePoint(point)

  onRouteUpdate?.(Array.from(routes.values()))

  return {
    success: true,
    message: 'Route switched successfully with seamless transition',
    previousState,
    newState: { ...route },
  }
}

export function requestRouteSwitch(request: RouteSwitchRequest) {
  rabbitMQ.publish(EXCHANGES.CMD, 'route.switch', {
    type: 'route.switch',
    payload: request,
    timestamp: new Date().toISOString(),
  })
}

export function requestPriorityUpdate(routeId: string, priority: number) {
  rabbitMQ.publish(EXCHANGES.CMD, 'route.priority.update', {
    type: 'route.priority.update',
    payload: { routeId, priority },
    timestamp: new Date().toISOString(),
  })
}

export function requestPrioritySchedule() {
  rabbitMQ.publish(EXCHANGES.CMD, 'route.priority.schedule', {
    type: 'route.priority.schedule',
    payload: {},
    timestamp: new Date().toISOString(),
  })
}

export function updateBandwidth(routeId: string, bandwidth: number) {
  rabbitMQ.publish(EXCHANGES.CMD, 'route.bandwidth.update', {
    type: 'route.bandwidth.update',
    payload: { routeId, bandwidth },
    timestamp: new Date().toISOString(),
  })
}

export function getAllRoutes(): RouteConfig[] {
  return Array.from(routes.values())
}

export function getRouteHistory(): RouteHistory[] {
  return [...routeHistory]
}

export function getTopology() {
  const nodes: TopologyNode[] = []
  const edges: TopologyEdge[] = []

  const sourceNodes = mockSignals.filter((s) => s.targetIds && s.targetIds.length > 0)
  const SOURCE_COLS = 2
  const SOURCE_START_X = 120
  const SOURCE_START_Y = 80
  const SOURCE_H_SPACING = 160
  const SOURCE_V_SPACING = 110

  sourceNodes.forEach((s, i) => {
    const col = i % SOURCE_COLS
    const row = Math.floor(i / SOURCE_COLS)
    nodes.push({
      id: s.id,
      label: s.name,
      type: 'source' as const,
      status: s.status,
      x: SOURCE_START_X + col * 320,
      y: SOURCE_START_Y + row * SOURCE_V_SPACING,
    })
  })

  const targetNodes = mockTargets
  const TARGET_START_X = 850
  const TARGET_START_Y = 80
  const TARGET_V_SPACING = 85

  targetNodes.forEach((t, i) => {
    nodes.push({
      id: t.id,
      label: t.name,
      type: 'target' as const,
      status: t.status,
      x: TARGET_START_X,
      y: TARGET_START_Y + i * TARGET_V_SPACING,
    })
  })

  const routerNode: TopologyNode = {
    id: 'ROUTER',
    label: '核心路由矩阵',
    type: 'router',
    status: 'online',
    x: 520,
    y: 300,
  }
  nodes.push(routerNode)

  routes.forEach((r) => {
    const target = mockTargets.find((t) => t.id === r.targetId)
    edges.push({
      id: `E${r.id}`,
      from: r.sourceId,
      to: r.targetId,
      bandwidth: r.bandwidth,
      maxBandwidth: target?.maxBandwidth || 30,
      isActive: r.isActive,
    })
  })

  return { nodes, edges }
}
