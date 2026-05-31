import { writable, derived } from 'svelte/store'
import type { SignalSource, RouteConfig, AlertEvent, DashboardKPI, WSMessage } from '../../shared/types'

export const signals = writable<SignalSource[]>([])
export const routes = writable<RouteConfig[]>([])
export const alerts = writable<AlertEvent[]>([])
export const kpi = writable<DashboardKPI>({
  totalSignals: 0,
  activeSignals: 0,
  averageBandwidth: 0,
  averageLatency: 0,
  alertCount: 0,
  onlineTargets: 0,
})
export const connected = writable(false)

let ws: WebSocket | null = null
let lastSignalJson = ''
let lastRouteJson = ''
let lastKpiJson = ''
let messageBuffer: WSMessage[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 150

function flushBuffer() {
  if (messageBuffer.length === 0) return
  const batch = [...messageBuffer]
  messageBuffer = []
  flushTimer = null

  for (const data of batch) {
    processMessage(data)
  }
}

function queueMessage(data: WSMessage) {
  messageBuffer.push(data)
  if (!flushTimer) {
    flushTimer = setTimeout(flushBuffer, FLUSH_INTERVAL)
  }
}

function processMessage(data: WSMessage) {
  switch (data.type) {
    case 'status_update': {
      const json = JSON.stringify(data.payload)
      if (json === lastSignalJson) break
      lastSignalJson = json
      signals.set(data.payload as SignalSource[])
      break
    }
    case 'route_change': {
      const json = JSON.stringify(data.payload)
      if (json === lastRouteJson) break
      lastRouteJson = json
      routes.set(data.payload as RouteConfig[])
      break
    }
    case 'kpi_update': {
      const json = JSON.stringify(data.payload)
      if (json === lastKpiJson) break
      lastKpiJson = json
      kpi.set(data.payload as DashboardKPI)
      break
    }
    case 'alert': {
      const newAlerts = data.payload as AlertEvent[]
      alerts.update((existing) => {
        const merged = [...newAlerts, ...existing]
        const seen = new Set<string>()
        return merged.filter((a) => {
          if (seen.has(a.id)) return false
          seen.add(a.id)
          return true
        }).slice(0, 50)
      })
      break
    }
    case 'stream_interrupt': {
      console.warn('[WS] Stream interrupt:', data.payload)
      break
    }
    case 'priority_schedule': {
      console.log('[WS] Priority scheduled:', data.payload)
      break
    }
  }
}

export function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${window.location.host}/ws`

  try {
    ws = new WebSocket(url)

    ws.onopen = () => {
      console.log('[WS] Connected')
      connected.set(true)
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WSMessage
        queueMessage(data)
      } catch (e) {
        console.error('[WS] Parse error:', e)
      }
    }

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting...')
      connected.set(false)
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      messageBuffer = []
      setTimeout(connect, 3000)
    }

    ws.onerror = (error: Event) => {
      console.error('[WS] Error:', error)
    }
  } catch (e) {
    console.error('[WS] Connection failed:', e)
    setTimeout(connect, 5000)
  }
}

export function disconnect() {
  if (ws) {
    ws.close()
    ws = null
  }
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  messageBuffer = []
}

export const wsStore = {
  signals,
  routes,
  alerts,
  kpi,
  connected,
  connect,
  disconnect,
  subscribe: kpi.subscribe,
}
