import si from 'systeminformation'
import { createLogger } from '../utils/logger'
import { config } from '../config'
import type { NodeMetrics } from '../types'

const logger = createLogger('metrics')

export class MetricsCollector {
  private metrics: NodeMetrics | null = null
  private collectInterval: NodeJS.Timeout | null = null

  async collect(): Promise<NodeMetrics> {
    try {
      const [cpu, mem, disk, network] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats()
      ])

      const diskUsage = disk.length > 0
        ? (disk[0].used / disk[0].size) * 100
        : 0

      this.metrics = {
        nodeName: config.nodeName,
        platform: config.platform,
        cpuUsage: cpu.currentLoad,
        memoryUsage: (mem.active / mem.total) * 100,
        diskUsage,
        networkIn: network[0]?.rx_sec || 0,
        networkOut: network[0]?.tx_sec || 0,
        activeConnections: 0,
        timestamp: new Date().toISOString()
      }

      logger.debug('Collected metrics:', this.metrics)
      return this.metrics
    } catch (error) {
      logger.error('Failed to collect metrics:', error)
      return {
        nodeName: config.nodeName,
        platform: config.platform,
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        networkIn: 0,
        networkOut: 0,
        activeConnections: 0,
        timestamp: new Date().toISOString()
      }
    }
  }

  startAutoCollect(intervalMs: number = 60000): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval)
    }

    this.collectInterval = setInterval(() => {
      this.collect()
    }, intervalMs)

    logger.info(`Started metrics collection every ${intervalMs}ms`)
  }

  stopAutoCollect(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval)
      this.collectInterval = null
      logger.info('Stopped metrics collection')
    }
  }

  getMetrics(): NodeMetrics | null {
    return this.metrics
  }
}

export const metricsCollector = new MetricsCollector()
export default metricsCollector