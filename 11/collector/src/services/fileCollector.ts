import * as fs from 'fs-extra'
import * as path from 'path'
import chokidar from 'chokidar'
import { createLogger } from '../utils/logger'
import { LogParser } from '../utils/logParser'
import { elasticsearchService } from '../services/elasticsearch'
import { redisService } from '../services/redis'
import type { LogEntry, DataSource } from '../types'
import { config } from '../config'

const logger = createLogger('file-collector')

const MAX_BUFFER_SIZE = 10000
const FLUSH_RETRY_LIMIT = 3
const FLUSH_RETRY_DELAY = 2000

export interface FileWatcher {
  id: string
  path: string
  watcher: chokidar.FSWatcher
  source: DataSource
  position: number
}

export class FileLogCollector {
  private watchers: Map<string, FileWatcher> = new Map()
  private buffer: LogEntry[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private isFlushing: boolean = false
  private positionFile: string = path.join(config.tmpDir || '/tmp', 'log-collector-positions.json')
  private droppedLogCount: number = 0
  private lastDroppedWarning: number = 0
  private bufferLock: Promise<void> = Promise.resolve()

  constructor() {
    this.loadPositions()
    this.startAutoFlush()
  }

  private loadPositions(): void {
    try {
      if (fs.existsSync(this.positionFile)) {
        const data = fs.readJSONSync(this.positionFile)
        Object.entries(data).forEach(([key, value]) => {
          // Positions loaded in memory
        })
      }
    } catch (error) {
      logger.warn('Failed to load positions:', error)
    }
  }

  private savePositions(): void {
    try {
      const positions: Record<string, number> = {}
      this.watchers.forEach((watcher) => {
        positions[watcher.path] = watcher.position
      })
      fs.outputJSONSync(this.positionFile, positions)
    } catch (error) {
      logger.warn('Failed to save positions:', error)
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffer()
    }, config.logFlushInterval)
  }

  private async acquireBufferLock(): Promise<void> {
    await this.bufferLock
  }

  private releaseBufferLock(): void {
    this.bufferLock = Promise.resolve()
  }

  private async flushBuffer(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) return

    this.isFlushing = true
    await this.acquireBufferLock()

    const logsToFlush = [...this.buffer]
    this.buffer = []

    try {
      await this.flushWithRetry(logsToFlush)
      logger.debug(`Flushed ${logsToFlush.length} logs to Elasticsearch`)
    } catch (error) {
      logger.error(`Failed to flush ${logsToFlush.length} logs after retries:`, error)
      this.handleFlushFailure(logsToFlush)
    } finally {
      this.isFlushing = false
      this.releaseBufferLock()
    }
  }

  private async flushWithRetry(logs: LogEntry[]): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= FLUSH_RETRY_LIMIT; attempt++) {
      try {
        await elasticsearchService.bulkIndexLogs(logs)
        return
      } catch (error: any) {
        lastError = error
        logger.warn(`Flush attempt ${attempt + 1}/${FLUSH_RETRY_LIMIT + 1} failed: ${error.message}`)

        if (attempt < FLUSH_RETRY_LIMIT) {
          await this.delay(FLUSH_RETRY_DELAY * (attempt + 1))
        }
      }
    }

    throw lastError || new Error('Unknown flush error')
  }

  private handleFlushFailure(logs: LogEntry[]): void {
    const remainingCapacity = MAX_BUFFER_SIZE - this.buffer.length

    if (remainingCapacity > 0) {
      const logsToRequeue = logs.slice(0, remainingCapacity)
      this.buffer.push(...logsToRequeue)

      if (logs.length > remainingCapacity) {
        const dropped = logs.length - remainingCapacity
        this.droppedLogCount += dropped
        this.logDroppedWarning(dropped)
      }
    } else {
      this.droppedLogCount += logs.length
      this.logDroppedWarning(logs.length)
    }
  }

  private logDroppedWarning(droppedCount: number): void {
    const now = Date.now()
    if (now - this.lastDroppedWarning > 60000) {
      logger.warn(`Dropped ${droppedCount} logs due to buffer overflow. Total dropped: ${this.droppedLogCount}`)
      this.lastDroppedWarning = now
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async addFile(source: DataSource): Promise<void> {
    const filePath = source.config.path
    if (!filePath) {
      throw new Error('File path is required')
    }

    if (this.watchers.has(filePath)) {
      logger.warn(`Already watching file: ${filePath}`)
      return
    }

    const resolvedPath = path.resolve(filePath)

    if (!fs.existsSync(resolvedPath)) {
      logger.warn(`File does not exist: ${resolvedPath}`)
    }

    const watcher = chokidar.watch(resolvedPath, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: true,
      usePolling: true,
      interval: 1000,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 500
      }
    })

    const fileWatcher: FileWatcher = {
      id: source.id,
      path: resolvedPath,
      watcher,
      source,
      position: source.config.startPosition || 0
    }

    watcher.on('add', async (filePath) => {
      logger.info(`File added: ${filePath}`)
      await this.readNewLines(fileWatcher, filePath)
    })

    watcher.on('change', async (filePath) => {
      await this.readNewLines(fileWatcher, filePath)
    })

    watcher.on('unlink', (filePath) => {
      logger.info(`File removed: ${filePath}`)
    })

    watcher.on('error', (error) => {
      logger.error(`Watcher error for ${resolvedPath}:`, error)
    })

    this.watchers.set(filePath, fileWatcher)

    if (fs.existsSync(resolvedPath)) {
      await this.readNewLines(fileWatcher, resolvedPath)
    }

    logger.info(`Started watching file: ${resolvedPath}`)
  }

  private async readNewLines(fileWatcher: FileWatcher, filePath: string): Promise<void> {
    try {
      await this.acquireBufferLock()

      const stats = fs.statSync(filePath)
      if (stats.size < fileWatcher.position) {
        logger.info(`File truncated: ${filePath}, resetting position`)
        fileWatcher.position = 0
      }

      if (stats.size === fileWatcher.position) {
        this.releaseBufferLock()
        return
      }

      const buffer = Buffer.alloc(Math.min(stats.size - fileWatcher.position, 1024 * 1024))
      const fileDescriptor = fs.openSync(filePath, 'r')
      const bytesRead = fs.readSync(fileDescriptor, buffer, 0, buffer.length, fileWatcher.position)
      fs.closeSync(fileDescriptor)

      const content = buffer.slice(0, bytesRead).toString('utf-8')
      const lines = content.split('\n').filter((line) => line.trim())

      let newLogsCount = 0
      for (const line of lines) {
        const logEntry = LogParser.parseFromText(line, fileWatcher.source.name)
        if (logEntry) {
          if (this.buffer.length >= MAX_BUFFER_SIZE) {
            this.droppedLogCount++
            this.logDroppedWarning(1)
          } else {
            this.buffer.push(logEntry)
            newLogsCount++
          }
        }
      }

      fileWatcher.position = stats.size
      this.savePositions()

      if (newLogsCount > 0 && this.buffer.length >= config.logBatchSize) {
        this.releaseBufferLock()
        await this.flushBuffer()
      } else {
        this.releaseBufferLock()
      }
    } catch (error) {
      logger.error(`Error reading file ${filePath}:`, error)
      this.releaseBufferLock()
    }
  }

  async removeFile(filePath: string): Promise<void> {
    const watcher = this.watchers.get(filePath)
    if (watcher) {
      await watcher.watcher.close()
      this.watchers.delete(filePath)
      logger.info(`Stopped watching file: ${filePath}`)
    }
  }

  getWatchedFiles(): string[] {
    return Array.from(this.watchers.keys())
  }

  getBufferSize(): number {
    return this.buffer.length
  }

  getDroppedLogCount(): number {
    return this.droppedLogCount
  }

  getStats(): { bufferSize: number; droppedCount: number; watchedFiles: number } {
    return {
      bufferSize: this.buffer.length,
      droppedCount: this.droppedLogCount,
      watchedFiles: this.watchers.size
    }
  }

  async forceFlush(): Promise<void> {
    await this.flushBuffer()
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    await this.flushBuffer()

    for (const watcher of this.watchers.values()) {
      await watcher.watcher.close()
    }

    this.watchers.clear()
    this.savePositions()

    if (this.droppedLogCount > 0) {
      logger.warn(`Total dropped logs during this session: ${this.droppedLogCount}`)
    }

    logger.info('File log collector shutdown complete')
  }
}

export const fileLogCollector = new FileLogCollector()
export default fileLogCollector