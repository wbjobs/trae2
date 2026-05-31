import type { SignalSource } from '../../shared/types'
import { rabbitMQ, QUEUES, EXCHANGES } from '../services/rabbitmq'
import { influxService } from '../services/influx'
import { mockSignals } from '../mock/data'
import { Point } from '@influxdata/influxdb-client'

const signals: Map<string, SignalSource> = new Map(mockSignals.map((s) => [s.id, { ...s }]))

interface SignalFilterState {
  latencyHistory: number[]
  bandwidthHistory: number[]
  packetLossHistory: number[]
  lastUpdate: number
}

const filterState: Map<string, SignalFilterState> = new Map(
  mockSignals.map((s) => [
    s.id,
    {
      latencyHistory: [s.latency],
      bandwidthHistory: [s.bandwidth],
      packetLossHistory: [s.packetLoss],
      lastUpdate: Date.now(),
    },
  ])
)

const WINDOW_SIZE = 8

function smoothValue(history: number[], newValue: number, windowSize: number): number {
  history.push(newValue)
  if (history.length > windowSize) {
    history.shift()
  }

  const sorted = [...history].sort((a, b) => a - b)
  const trimCount = Math.floor(sorted.length * 0.15)
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount)
  const mean = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length

  const prevMean = history.length > 1
    ? history.slice(0, -1).reduce((sum, v) => sum + v, 0) / (history.length - 1)
    : mean

  const maxDelta = prevMean * 0.15
  const maxJump = Math.max(maxDelta, 5)
  const clampedDelta = Math.max(-maxJump, Math.min(maxJump, newValue - prevMean))
  const filtered = prevMean + clampedDelta

  const alpha = 0.35
  return alpha * filtered + (1 - alpha) * mean
}

export function startCollectorWorker(onUpdate: (signals: SignalSource[]) => void) {
  console.log('[Collector] Worker started')

  rabbitMQ.subscribe(QUEUES.COLLECT_CMD, (msg) => {
    console.log('[Collector] Command received:', msg.type)
  })

  const simulateMetrics = () => {
    const now = Date.now()

    signals.forEach((signal) => {
      if (signal.status === 'active') {
        const state = filterState.get(signal.id)!
        const timeSinceLastUpdate = now - state.lastUpdate

        const bandwidthDelta = (Math.random() - 0.5) * 2.0
        const latencyDelta = (Math.random() - 0.5) * 6.0
        const lossDelta = (Math.random() - 0.5) * 0.015

        const rawBandwidth = Math.max(0, signal.bandwidth + bandwidthDelta)
        const rawLatency = Math.max(0, signal.latency + latencyDelta)
        const rawPacketLoss = Math.max(0, Math.min(100, signal.packetLoss + lossDelta))

        signal.bandwidth = Math.round(
          smoothValue(state.bandwidthHistory, rawBandwidth, WINDOW_SIZE) * 100
        ) / 100
        signal.latency = Math.round(
          smoothValue(state.latencyHistory, rawLatency, WINDOW_SIZE) * 10
        ) / 10
        signal.packetLoss = Math.round(
          smoothValue(state.packetLossHistory, rawPacketLoss, WINDOW_SIZE) * 1000
        ) / 1000

        state.lastUpdate = now

        const timestamp = new Date(now).toISOString()
        const point = new Point('signal_status')
          .tag('signalId', signal.id)
          .tag('signalType', signal.type)
          .tag('protocol', signal.protocol)
          .timestamp(new Date(now))
          .floatField('bandwidth', signal.bandwidth)
          .floatField('latency', signal.latency)
          .floatField('packetLoss', signal.packetLoss)
          .stringField('status', signal.status)

        influxService.writePoint(point)
      }
    })

    const signalList = Array.from(signals.values())
    rabbitMQ.publish(EXCHANGES.EVT, 'signal.status', {
      type: 'status_update',
      payload: signalList,
      timestamp: new Date().toISOString(),
    })

    onUpdate(signalList)
  }

  const interval = setInterval(simulateMetrics, 2000)

  return () => {
    clearInterval(interval)
  }
}

export function getAllSignals(): SignalSource[] {
  return Array.from(signals.values())
}

export function getSignalById(id: string): SignalSource | undefined {
  return signals.get(id)
}

export function updateSignalStatus(id: string, status: SignalSource['status']) {
  const signal = signals.get(id)
  if (signal) {
    signal.status = status
    return signal
  }
  return null
}
