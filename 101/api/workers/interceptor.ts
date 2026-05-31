import type { AlertRule, AlertEvent, SignalSource } from '../../shared/types'
import { rabbitMQ, QUEUES, EXCHANGES } from '../services/rabbitmq'
import { influxService } from '../services/influx'
import { mockAlertRules, mockAlertEvents, mockSignals } from '../mock/data'
import { Point } from '@influxdata/influxdb-client'
import { requestRouteSwitch, getAllRoutes } from './routing'
import { timestamp } from '../utils/timestamp'

const rules: Map<string, AlertRule> = new Map(mockAlertRules.map((r) => [r.id, { ...r }]))
const events: AlertEvent[] = [...mockAlertEvents]

type AlertUpdateCallback = (events: AlertEvent[]) => void

export function startInterceptorWorker(onAlertUpdate: AlertUpdateCallback) {
  console.log('[Interceptor] Worker started')

  rabbitMQ.subscribe(QUEUES.INTERCEPT_CMD, (msg) => {
    console.log('[Interceptor] Command received:', msg.type)
  })

  rabbitMQ.subscribe(QUEUES.SIGNAL_EVT, (msg) => {
    if (msg.type === 'status_update') {
      const signals = msg.payload as SignalSource[]
      checkAnomalies(signals, onAlertUpdate)
    }
  })
}

function checkAnomalies(signals: SignalSource[], onAlertUpdate: AlertUpdateCallback) {
  signals.forEach((signal) => {
    if (signal.status !== 'active') return

    rules.forEach((rule) => {
      if (!rule.enabled) return

      let currentValue = 0
      let isAnomaly = false

      switch (rule.type) {
        case 'bandwidth_anomaly':
          currentValue = signal.bandwidth
          isAnomaly = currentValue > rule.threshold
          break
        case 'latency_anomaly':
          currentValue = signal.latency
          isAnomaly = currentValue > rule.threshold
          break
        case 'packet_loss':
          currentValue = signal.packetLoss
          isAnomaly = currentValue > rule.threshold
          break
        case 'black_frame':
        case 'freeze_frame':
        case 'silence':
          currentValue = Math.random() * 10
          isAnomaly = Math.random() < 0.02
          break
      }

      if (isAnomaly && Math.random() < 0.15) {
        const eventTs = timestamp.now()
        const eventTsISO = new Date(eventTs).toISOString()
        const alertEvent: AlertEvent = {
          id: `AE${eventTs}`,
          ruleId: rule.id,
          signalId: signal.id,
          type: rule.type,
          severity: rule.severity,
          message: `${signal.name} 触发${rule.name}规则`,
          value: Math.round(currentValue * 100) / 100,
          threshold: rule.threshold,
          timestamp: eventTsISO,
          resolved: false,
        }

        events.unshift(alertEvent)
        if (events.length > 100) events.pop()

        const point = new Point('alert_events')
          .tag('alertRuleId', rule.id)
          .tag('signalId', signal.id)
          .tag('alertType', rule.type)
          .tag('severity', rule.severity)
          .timestamp(new Date(eventTs))
          .floatField('value', alertEvent.value)
          .floatField('threshold', rule.threshold)
          .stringField('message', alertEvent.message)
          .booleanField('resolved', false)

        influxService.writePoint(point)

        rabbitMQ.publish(EXCHANGES.ALERT, 'alert.fired', {
          type: 'alert_fired',
          payload: alertEvent,
          timestamp: new Date().toISOString(),
        })

        if (rule.action === 'switch' || rule.action === 'alert_and_switch') {
          triggerAutoSwitch(signal.id)
        }

        onAlertUpdate([...events])
      }
    })
  })
}

function triggerAutoSwitch(signalId: string) {
  const signal = mockSignals.find((s) => s.id === signalId)
  if (!signal) return

  const standby = mockSignals.find((s) => s.type === signal.type && s.status === 'standby' && s.id !== signalId)
  if (!standby) return

  const activeRoutes = getAllRoutes()
  const route = activeRoutes.find((r) => r.sourceId === signalId)

  if (route) {
    requestRouteSwitch({
      routeId: route.id,
      newSourceId: standby.id,
      reason: 'auto-failover',
    })
  }
}

export function getAlertRules(): AlertRule[] {
  return Array.from(rules.values())
}

export function getAlertEvents(): AlertEvent[] {
  return [...events].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

export function createAlertRule(rule: Omit<AlertRule, 'id'>): AlertRule {
  const newRule: AlertRule = {
    ...rule,
    id: `AR${Date.now()}`,
  }
  rules.set(newRule.id, newRule)
  return newRule
}

export function updateAlertRule(id: string, updates: Partial<AlertRule>): AlertRule | null {
  const rule = rules.get(id)
  if (!rule) return null
  Object.assign(rule, updates)
  return rule
}

export function deleteAlertRule(id: string): boolean {
  return rules.delete(id)
}

export function resolveAlert(eventId: string): AlertEvent | null {
  const event = events.find((e) => e.id === eventId)
  if (event) {
    event.resolved = true
    return event
  }
  return null
}
