import { v4 as uuidv4 } from 'uuid'
import { createLogger } from './logger'

const logger = createLogger('trace-context')

export interface TraceContext {
  traceId: string
  rootSpanId: string
  currentSpanId: string
  serviceName: string
  nodeName: string
  startTime: number
  spans: Map<string, SpanInfo>
  completed: boolean
}

export interface SpanInfo {
  spanId: string
  parentSpanId: string
  service: string
  startTime: number
  endTime?: number
  status: 'pending' | 'success' | 'error'
}

class TraceContextManager {
  private activeTraces: Map<string, TraceContext> = new Map()
  private spanToTraceMap: Map<string, string> = new Map()
  private maxTraceAge: number = 30 * 60 * 1000
  private maxActiveTraces: number = 10000
  private cleanupInterval: NodeJS.Timeout | null = null
  private started: boolean = false

  start(): void {
    if (this.started) return
    this.started = true
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTraces()
    }, 60 * 1000)
    logger.info('TraceContextManager started')
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.activeTraces.clear()
    this.spanToTraceMap.clear()
    this.started = false
    logger.info('TraceContextManager stopped')
  }

  cleanupExpired(): void {
    this.cleanupExpiredTraces()
  }

  private cleanupExpiredTraces(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [traceId, context] of this.activeTraces) {
      const age = now - context.startTime
      if (age > this.maxTraceAge || context.completed) {
        this.activeTraces.delete(traceId)
        for (const spanId of context.spans.keys()) {
          this.spanToTraceMap.delete(spanId)
        }
        cleaned++
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired trace contexts`)
    }

    if (this.activeTraces.size > this.maxActiveTraces) {
      const sorted = Array.from(this.activeTraces.entries())
        .sort((a, b) => a[1].startTime - b[1].startTime)
      const toRemove = sorted.slice(0, this.activeTraces.size - this.maxActiveTraces)
      for (const [traceId, context] of toRemove) {
        this.activeTraces.delete(traceId)
        for (const spanId of context.spans.keys()) {
          this.spanToTraceMap.delete(spanId)
        }
      }
      logger.warn(`Evicted ${toRemove.length} traces due to capacity limit`)
    }
  }

  generateTraceId(): string {
    return `trace-${Date.now()}-${uuidv4().replace(/-/g, '').slice(0, 8)}`
  }

  generateSpanId(): string {
    return `span-${uuidv4().replace(/-/g, '').slice(0, 12)}`
  }

  startTrace(
    serviceName: string,
    nodeName: string,
    existingTraceId?: string
  ): TraceContext {
    const traceId = existingTraceId || this.generateTraceId()
    const rootSpanId = this.generateSpanId()

    const context: TraceContext = {
      traceId,
      rootSpanId,
      currentSpanId: rootSpanId,
      serviceName,
      nodeName,
      startTime: Date.now(),
      spans: new Map(),
      completed: false
    }

    context.spans.set(rootSpanId, {
      spanId: rootSpanId,
      parentSpanId: '',
      service: serviceName,
      startTime: Date.now(),
      status: 'pending'
    })

    this.spanToTraceMap.set(rootSpanId, traceId)
    this.activeTraces.set(traceId, context)

    logger.debug(`Started trace: ${traceId}, root span: ${rootSpanId}`)
    return context
  }

  createChildSpan(
    parentSpanId: string,
    serviceName: string
  ): SpanInfo | null {
    const traceId = this.spanToTraceMap.get(parentSpanId)
    if (!traceId) {
      logger.warn(`Parent span ${parentSpanId} not found in any trace`)
      return null
    }

    const context = this.activeTraces.get(traceId)
    if (!context) {
      logger.warn(`Trace ${traceId} not found for span ${parentSpanId}`)
      return null
    }

    const spanId = this.generateSpanId()
    const spanInfo: SpanInfo = {
      spanId,
      parentSpanId,
      service: serviceName,
      startTime: Date.now(),
      status: 'pending'
    }

    context.spans.set(spanId, spanInfo)
    context.currentSpanId = spanId
    this.spanToTraceMap.set(spanId, traceId)

    logger.debug(`Created child span: ${spanId}, parent: ${parentSpanId}`)
    return spanInfo
  }

  completeSpan(spanId: string, status: 'success' | 'error' = 'success'): void {
    const traceId = this.spanToTraceMap.get(spanId)
    if (!traceId) return

    const context = this.activeTraces.get(traceId)
    if (!context) return

    const span = context.spans.get(spanId)
    if (span) {
      span.endTime = Date.now()
      span.status = status
    }

    if (spanId === context.rootSpanId) {
      context.completed = true
    }
  }

  getTraceContext(traceId: string): TraceContext | null {
    return this.activeTraces.get(traceId) || null
  }

  getTraceBySpanId(spanId: string): TraceContext | null {
    const traceId = this.spanToTraceMap.get(spanId)
    return traceId ? this.activeTraces.get(traceId) || null : null
  }

  getAllActiveTraces(): TraceContext[] {
    return Array.from(this.activeTraces.values())
  }

  getActiveTraceCount(): number {
    return this.activeTraces.size
  }

  getSpanInfo(spanId: string): SpanInfo | null {
    const traceId = this.spanToTraceMap.get(spanId)
    if (!traceId) return null

    const context = this.activeTraces.get(traceId)
    return context?.spans.get(spanId) || null
  }

  invalidateTrace(traceId: string): void {
    const context = this.activeTraces.get(traceId)
    if (context) {
      for (const spanId of context.spans.keys()) {
        this.spanToTraceMap.delete(spanId)
      }
      this.activeTraces.delete(traceId)
    }
  }
}

export const traceContextManager = new TraceContextManager()
export default traceContextManager