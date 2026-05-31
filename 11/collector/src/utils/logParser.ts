import { v4 as uuidv4 } from 'uuid'
import type { LogEntry, LogLevel, OSType } from '../types'
import { config } from '../config'
import { traceContextManager } from './traceContext'
import { createLogger } from './logger'

const logger = createLogger('log-parser')

export class LogParser {
  static parseFromText(text: string, source?: string): LogEntry | null {
    try {
      const jsonMatch = text.match(/\{.*\}/s/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return this.normalizeLogEntry(parsed)
      }

      const patterns = [
        {
          regex: /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\.?\d*)\s+(DEBUG|INFO|WARN|ERROR|FATAL)\s+\[?([^\]]+)\]?\s+(.*)$/,
          groups: ['timestamp', 'level', 'service', 'message']
        },
        {
          regex: /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\.?\d*)\]\s+(DEBUG|INFO|WARN|ERROR|FATAL)\s+(.*)$/,
          groups: ['timestamp', 'level', 'message']
        }
      ]

      for (const { regex, groups } of patterns) {
        const match = text.match(regex)
        if (match) {
          const entry: Partial<LogEntry> = {}

          groups.forEach((group, index) => {
            if (match[index + 1]) {
              (entry as any)[group] = match[index + 1]
            }
          })

          return this.normalizeLogEntry(entry as any, source)
        }
      }

      return this.normalizeLogEntry({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: text,
        service: source || 'unknown'
      }, source)
    } catch (error) {
      return null
    }
  }

  static normalizeLogEntry(entry: Partial<LogEntry>, source?: string): LogEntry {
    const timestamp = entry.timestamp
      ? new Date(entry.timestamp).toISOString()
      : new Date().toISOString()

    let traceId = entry.traceId
    let spanId = entry.spanId
    let parentSpanId = entry.parentSpanId

    if (traceId) {
      let context = traceContextManager.getTraceContext(traceId)
      if (!context) {
        context = traceContextManager.startTrace(
          entry.service || source || config.serviceName,
          entry.node || config.nodeName,
          traceId
        )
        logger.debug(`Created new trace context for existing traceId: ${traceId}`)
      }

      if (!spanId) {
        const newSpan = traceContextManager.createChildSpan(
          context.currentSpanId,
          entry.service || source || config.serviceName
        )
        if (newSpan) {
          spanId = newSpan.spanId
          parentSpanId = newSpan.parentSpanId
        }
      }
    } else {
      const context = traceContextManager.startTrace(
        entry.service || source || config.serviceName,
        entry.node || config.nodeName
      )
      traceId = context.traceId
      spanId = context.currentSpanId
      parentSpanId = ''
    }

    if (!entry.id) {
      entry.id = uuidv4()
    }

    return {
      id: entry.id,
      traceId,
      spanId,
      parentSpanId: parentSpanId || '',
      timestamp,
      level: (entry.level as LogLevel) || 'INFO',
      service: entry.service || source || config.serviceName,
      node: entry.node || config.nodeName,
      os: entry.os || this.getOSType(),
      message: entry.message || '',
      stackTrace: entry.stackTrace,
      metadata: entry.metadata,
      tags: entry.tags
    }
  }

  static generateTraceId(): string {
    return traceContextManager.generateTraceId()
  }

  static generateSpanId(): string {
    return traceContextManager.generateSpanId()
  }

  static getOSType(): OSType {
    if (config.platform === 'win32') return 'Windows'
    return 'Linux'
  }

  static parseSyslog(message: string): Partial<LogEntry> {
    const syslogRegex = /^<(\d+)>(\w{3}\s+\d+\s\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+):\s+(.*)$/

    const match = message.match(syslogRegex)
    if (match) {
      const priority = parseInt(match[1])
      const severity = priority & 0x07

      const levelMap: Record<number, LogLevel> = {
        0: 'FATAL',
        1: 'FATAL',
        2: 'FATAL',
        3: 'ERROR',
        4: 'WARN',
        5: 'INFO',
        6: 'INFO',
        7: 'DEBUG'
      }

      return {
        timestamp: new Date(`${match[2]} ${new Date().getFullYear()}`).toISOString(),
        level: levelMap[severity] || 'INFO',
        node: match[3],
        service: match[4],
        message: match[5]
      }
    }

    return { message }
  }

  static completeSpan(spanId: string, status: 'success' | 'error' = 'success'): void {
    traceContextManager.completeSpan(spanId, status)
  }
}

export default LogParser