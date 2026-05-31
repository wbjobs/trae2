import express, { type Request, type Response } from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import cors from 'cors'
import type {
  SignalSource,
  RouteConfig,
  RouteSwitchRequest,
  AlertRule,
  AlertEvent,
  TimeSeriesQuery,
  DashboardKPI,
  WSMessage,
  TimeSeriesData,
  TimeSeriesDataPoint,
  StreamInterruptEvent,
} from '../shared/types'
import { rabbitMQ, QUEUES } from './services/rabbitmq'
import { startCollectorWorker, getAllSignals, getSignalById } from './workers/collector'
import {
  startRoutingWorker,
  getAllRoutes,
  getRouteHistory,
  requestRouteSwitch,
  requestPriorityUpdate,
  requestPrioritySchedule,
  updateBandwidth,
  getTopology,
  scheduleByPriority,
  setInterruptCallback,
  updateSignalStatusCache,
} from './workers/routing'
import {
  startInterceptorWorker,
  getAlertRules,
  getAlertEvents,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  resolveAlert,
} from './workers/interceptor'
import { mockTargets, generateTimeSeriesData } from './mock/data'
import { timestamp, sortByTime, validateTimeOrder } from './utils/timestamp'

const app = express()
app.use(cors())
app.use(express.json())

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

let currentSignals: SignalSource[] = getAllSignals()
let currentRoutes: RouteConfig[] = getAllRoutes()
let currentAlerts: AlertEvent[] = getAlertEvents()
const timeSeriesCache: Map<string, TimeSeriesDataPoint[]> = new Map()
const CACHE_MAX_SIZE = 120

const broadcastQueue: WSMessage[] = []
let broadcastFlushTimer: ReturnType<typeof setTimeout> | null = null
const BROADCAST_FLUSH_INTERVAL = 200
let lastBroadcastJson: Map<string, string> = new Map()

function enqueueBroadcast(msg: WSMessage) {
  const json = JSON.stringify(msg.payload)
  const last = lastBroadcastJson.get(msg.type)
  if (last === json) return
  lastBroadcastJson.set(msg.type, json)

  broadcastQueue.push(msg)
  if (!broadcastFlushTimer) {
    broadcastFlushTimer = setTimeout(flushBroadcast, BROADCAST_FLUSH_INTERVAL)
  }
}

function flushBroadcast() {
  broadcastFlushTimer = null
  if (broadcastQueue.length === 0) return

  const messages = [...broadcastQueue]
  broadcastQueue.length = 0

  const merged = new Map<string, WSMessage>()
  for (const msg of messages) {
    merged.set(msg.type, msg)
  }

  const data = JSON.stringify(Array.from(merged.values()))
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

function broadcastMessage(msg: WSMessage) {
  enqueueBroadcast(msg)
}

function appendToTimeSeriesCache(key: string, value: number, ts?: string) {
  const cached = timeSeriesCache.get(key) || []
  const time = ts || timestamp.nowISO()

  if (cached.length > 0) {
    const lastTime = new Date(cached[cached.length - 1].time).getTime()
    const currentTime = new Date(time).getTime()
    if (currentTime < lastTime) {
      console.warn(`[Cache] Time regression detected for ${key}: ${time} < ${cached[cached.length - 1].time}`)
    }
  }

  cached.push({ time, value })

  while (cached.length > CACHE_MAX_SIZE) {
    cached.shift()
  }

  timeSeriesCache.set(key, cached)
}

async function main() {
  await rabbitMQ.init()

  startCollectorWorker((signals) => {
    currentSignals = signals
    broadcastMessage({ type: 'status_update', payload: signals })

    const batchTs = timestamp.nowISO()
    signals.forEach((s) => {
      appendToTimeSeriesCache(`bandwidth_${s.id}`, s.bandwidth, batchTs)
      appendToTimeSeriesCache(`latency_${s.id}`, s.latency, batchTs)
      appendToTimeSeriesCache(`packetLoss_${s.id}`, s.packetLoss, batchTs)
      updateSignalStatusCache(s.id, {
        status: s.status,
        bandwidth: s.bandwidth,
        latency: s.latency,
        packetLoss: s.packetLoss,
      })
    })

    broadcastMessage({ type: 'kpi_update', payload: computeKPI() })
  })

  startRoutingWorker((routes) => {
    currentRoutes = routes
    broadcastMessage({ type: 'route_change', payload: routes })
  })

  setInterruptCallback((event: StreamInterruptEvent) => {
    console.warn(`[Stream] Interrupt: ${event.signalName} - ${event.reason}, backup: ${event.backupSourceName || 'none'}`)
    broadcastMessage({ type: 'stream_interrupt', payload: event })
    if (event.switchInitiated) {
      currentAlerts = getAlertEvents()
      broadcastMessage({ type: 'alert', payload: currentAlerts.slice(0, 20) })
    }
  })

  startInterceptorWorker((alerts) => {
    currentAlerts = alerts
    broadcastMessage({ type: 'alert', payload: alerts.slice(0, 20) })
  })

  rabbitMQ.subscribe(QUEUES.ALERT_EVT, (msg) => {
    if (msg.type === 'alert_fired') {
      broadcastMessage({ type: 'alert', payload: [msg.payload] })
    }
  })
}

function computeKPI(): DashboardKPI {
  const activeSignals = currentSignals.filter((s) => s.status === 'active')
  const avgBandwidth =
    activeSignals.length > 0
      ? activeSignals.reduce((sum, s) => sum + s.bandwidth, 0) / activeSignals.length
      : 0
  const avgLatency =
    activeSignals.length > 0
      ? activeSignals.reduce((sum, s) => sum + s.latency, 0) / activeSignals.length
      : 0
  const unresolvedAlerts = currentAlerts.filter((a) => !a.resolved).length
  const onlineTargets = mockTargets.filter((t) => t.status === 'online').length

  return {
    totalSignals: currentSignals.length,
    activeSignals: activeSignals.length,
    averageBandwidth: Math.round(avgBandwidth * 100) / 100,
    averageLatency: Math.round(avgLatency * 10) / 10,
    alertCount: unresolvedAlerts,
    onlineTargets,
  }
}

app.get('/api/signals', (req: Request, res: Response<SignalSource[]>) => {
  res.json(currentSignals)
})

app.get('/api/signals/:id', (req: Request<{ id: string }>, res: Response<SignalSource | { error: string }>) => {
  const signal = getSignalById(req.params.id)
  if (signal) {
    res.json(signal)
  } else {
    res.status(404).json({ error: 'Signal not found' })
  }
})

app.get('/api/targets', (req: Request, res: Response) => {
  res.json(mockTargets)
})

app.get('/api/routes', (req: Request, res: Response<RouteConfig[]>) => {
  res.json(currentRoutes)
})

app.post('/api/routes/:id/switch', (req: Request<{ id: string }, unknown, RouteSwitchRequest>, res: Response) => {
  requestRouteSwitch({ ...req.body, routeId: req.params.id })
  res.json({ success: true, message: 'Switch command sent' })
})

app.put('/api/routes/:id/bandwidth', (req: Request<{ id: string }, unknown, { bandwidth: number }>, res: Response) => {
  updateBandwidth(req.params.id, req.body.bandwidth)
  res.json({ success: true })
})

app.put('/api/routes/:id/priority', (req: Request<{ id: string }, unknown, { priority: number }>, res: Response) => {
  requestPriorityUpdate(req.params.id, req.body.priority)
  res.json({ success: true, message: 'Priority update command sent' })
})

app.post('/api/routes/priority/schedule', (req: Request, res: Response) => {
  requestPrioritySchedule()
  const results = scheduleByPriority()
  res.json({ success: true, results })
})

app.get('/api/routes/history', (req: Request, res: Response) => {
  res.json(getRouteHistory())
})

app.get('/api/topology', (req: Request, res: Response) => {
  res.json(getTopology())
})

app.get('/api/status/realtime', (req: Request, res: Response) => {
  res.json({
    signals: currentSignals,
    routes: currentRoutes,
    targets: mockTargets,
  })
})

app.get('/api/alerts/rules', (req: Request, res: Response<AlertRule[]>) => {
  res.json(getAlertRules())
})

app.post('/api/alerts/rules', (req: Request<unknown, unknown, Omit<AlertRule, 'id'>>, res: Response<AlertRule>) => {
  res.json(createAlertRule(req.body))
})

app.put('/api/alerts/rules/:id', (req: Request<{ id: string }, unknown, Partial<AlertRule>>, res: Response) => {
  const rule = updateAlertRule(req.params.id, req.body)
  if (rule) {
    res.json(rule)
  } else {
    res.status(404).json({ error: 'Rule not found' })
  }
})

app.delete('/api/alerts/rules/:id', (req: Request<{ id: string }>, res: Response) => {
  const success = deleteAlertRule(req.params.id)
  if (success) {
    res.json({ success: true })
  } else {
    res.status(404).json({ error: 'Rule not found' })
  }
})

app.get('/api/alerts/events', (req: Request, res: Response<AlertEvent[]>) => {
  res.json(currentAlerts)
})

app.put('/api/alerts/events/:id/resolve', (req: Request<{ id: string }>, res: Response) => {
  const event = resolveAlert(req.params.id)
  if (event) {
    res.json(event)
    broadcastMessage({ type: 'alert', payload: [event] })
  } else {
    res.status(404).json({ error: 'Event not found' })
  }
})

app.get('/api/timeseries/query', (req: Request<unknown, unknown, unknown, TimeSeriesQuery>, res: Response<TimeSeriesData>) => {
  const { measurement, signalId } = req.query

  let values: TimeSeriesDataPoint[] = []
  if (signalId) {
    const key = `${measurement}_${signalId}`
    values = timeSeriesCache.get(key) || []
    if (values.length === 0) {
      if (measurement === 'bandwidth') {
        const signal = currentSignals.find((s) => s.id === signalId)
        values = generateTimeSeriesData(signal?.bandwidth || 10, 3, 1)
      } else if (measurement === 'latency') {
        const signal = currentSignals.find((s) => s.id === signalId)
        values = generateTimeSeriesData(signal?.latency || 20, 10, 1)
      } else if (measurement === 'packetLoss') {
        values = generateTimeSeriesData(0.02, 0.05, 1)
      }
    }
  } else {
    values = generateTimeSeriesData(10, 3, 1)
  }

  if (values.length > 0) {
    values = sortByTime(values)
  }

  res.json({
    measurement: measurement as string,
    tags: { signalId: signalId || 'all' },
    values,
  })
})

app.get('/api/dashboard/kpi', (req: Request, res: Response<DashboardKPI>) => {
  res.json(computeKPI())
})

wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket] Client connected')

  const initialMessages: WSMessage[] = [
    { type: 'status_update', payload: currentSignals },
    { type: 'route_change', payload: currentRoutes },
    { type: 'kpi_update', payload: computeKPI() },
    { type: 'alert', payload: currentAlerts.slice(0, 20) },
  ]

  ws.send(JSON.stringify(initialMessages))

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as WSMessage
      console.log('[WebSocket] Message received:', msg.type)
    } catch (e: unknown) {
      console.error('[WebSocket] Parse error:', e)
    }
  })

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected')
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`)
  console.log(`[Server] WebSocket: ws://localhost:${PORT}/ws`)
  main()
})
