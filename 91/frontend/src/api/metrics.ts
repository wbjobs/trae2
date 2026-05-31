import type { MetricsData, ThroughputData } from '@/types'

const WS_URL = import.meta.env.VITE_WS_URL

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const listeners: Map<string, Set<(...args: any[]) => void>> = new Map()

function getOrCreateConnection(): WebSocket {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return ws
  }

  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      const eventType = data.type || data.event
      if (eventType) {
        const cbs = listeners.get(eventType)
        if (cbs) {
          cbs.forEach(cb => cb(data.payload ?? data))
        }
      }
      const allCbs = listeners.get('*')
      if (allCbs) {
        allCbs.forEach(cb => cb(data))
      }
    } catch {
      // ignore non-JSON messages
    }
  }

  ws.onclose = () => {
    reconnectTimer = setTimeout(() => {
      getOrCreateConnection()
    }, 3000)
  }

  ws.onerror = () => {
    ws?.close()
  }

  return ws
}

export const metricsApi = {
  connect(): WebSocket {
    return getOrCreateConnection()
  },

  disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
    listeners.clear()
  },

  onRealtimeMetrics(callback: (data: MetricsData) => void): void {
    this.connect()
    if (!listeners.has('metrics')) listeners.set('metrics', new Set())
    listeners.get('metrics')!.add(callback)
  },

  onRealtimeThroughput(callback: (data: ThroughputData) => void): void {
    this.connect()
    if (!listeners.has('throughput')) listeners.set('throughput', new Set())
    listeners.get('throughput')!.add(callback)
  },

  off(event: string, callback: (...args: any[]) => void): void {
    const cbs = listeners.get(event)
    if (cbs) {
      cbs.delete(callback)
      if (cbs.size === 0) listeners.delete(event)
    }
  },

  getHistoricalMetrics(interval: string = '1m', startTime?: string, endTime?: string): Promise<MetricsData[]> {
    const params = new URLSearchParams({ interval })
    if (startTime) params.set('startTime', startTime)
    if (endTime) params.set('endTime', endTime)
    return fetch(`${import.meta.env.VITE_API_QUERY}/metrics?${params}`)
      .then(res => res.json())
  }
}
