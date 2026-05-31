import { EventEmitter } from 'events';
import { terminalRepository } from '../database/repositories/TerminalRepository';
import { TerminalStatus } from '../types';
import logger from '../utils/logger';
import { distributedLockService } from './distributed-lock.service';

export interface TerminalOfflineEvent {
  terminalId: string;
  lastReportTime: number;
  offlineDuration: number;
  detectionTime: number;
}

export interface TerminalOnlineEvent {
  terminalId: string;
  offlineDuration: number;
  recoveryTime: number;
}

export interface DetectionConfig {
  offlineThresholdMs: number;
  warningThresholdMs: number;
  checkIntervalMs: number;
  batchSize: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: DetectionConfig = {
  offlineThresholdMs: 300000,
  warningThresholdMs: 120000,
  checkIntervalMs: 30000,
  batchSize: 100,
  maxRetries: 3,
};

export class TerminalLivenessDetector extends EventEmitter {
  private config: DetectionConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private offlineTerminals: Map<string, { detectedAt: number; notified: boolean }> =
    new Map();
  private detectionLockKey = 'terminal:liveness:lock';

  constructor(config?: Partial<DetectionConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setMaxListeners(100);
  }

  public start(): void {
    if (this.isRunning) {
      logger.warn('Terminal liveness detector already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting terminal liveness detector:', {
      config: this.config,
    });

    this.checkInterval = setInterval(
      () => this.runDetectionCycle(),
      this.config.checkIntervalMs
    );

    this.runDetectionCycle();
  }

  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    this.offlineTerminals.clear();
    logger.info('Terminal liveness detector stopped');
  }

  private async runDetectionCycle(): Promise<void> {
    const lockValue = Math.random().toString(36).substring(7);
    const lockAcquired = await distributedLockService.acquireLock(
      this.detectionLockKey,
      lockValue,
      this.config.checkIntervalMs - 5000
    );

    if (!lockAcquired) {
      logger.debug(
        'Skipping detection cycle, lock held by another instance'
      );
      return;
    }

    try {
      await this.detectOfflineTerminals();
      await this.detectRecoveredTerminals();
    } catch (err) {
      logger.error('Error in detection cycle:', err);
    } finally {
      await distributedLockService.releaseLock(
        this.detectionLockKey,
        lockValue
      );
    }
  }

  private async detectOfflineTerminals(): Promise<void> {
    const now = Date.now();
    const offlineCutoff = now - this.config.offlineThresholdMs;
    const warningCutoff = now - this.config.warningThresholdMs;

    const onlineTerminals = await terminalRepository.getOnlineTerminals();
    const newlyOffline: string[] = [];
    const warnings: string[] = [];

    for (const terminal of onlineTerminals) {
      const lastReportTime = terminal.lastReportTime || 0;

      if (lastReportTime < offlineCutoff) {
        if (!this.offlineTerminals.has(terminal.terminalId)) {
          newlyOffline.push(terminal.terminalId);
          this.offlineTerminals.set(terminal.terminalId, {
            detectedAt: now,
            notified: false,
          });

          try {
            await terminalRepository.updateStatus(
              terminal.terminalId,
              TerminalStatus.OFFLINE
            );
          } catch (err) {
            logger.error('Failed to update terminal status to offline:', {
              terminalId: terminal.terminalId,
              error: err,
            });
          }
        }
      } else if (lastReportTime < warningCutoff) {
        warnings.push(terminal.terminalId);
      }
    }

    if (newlyOffline.length > 0) {
      logger.info('Detected newly offline terminals:', {
        count: newlyOffline.length,
        terminals: newlyOffline.slice(0, 10),
      });

      for (const terminalId of newlyOffline) {
        const terminal = await terminalRepository.findByTerminalId(terminalId);
        const event: TerminalOfflineEvent = {
          terminalId,
          lastReportTime: terminal?.lastReportTime || 0,
          offlineDuration: now - (terminal?.lastReportTime || now),
          detectionTime: now,
        };
        this.emit('terminal:offline', event);
      }
    }

    if (warnings.length > 0) {
      logger.debug('Terminals approaching offline threshold:', {
        count: warnings.length,
      });
    }
  }

  private async detectRecoveredTerminals(): Promise<void> {
    const now = Date.now();
    const recovered: string[] = [];

    for (const [terminalId, info] of this.offlineTerminals.entries()) {
      const terminal = await terminalRepository.findByTerminalId(terminalId);

      if (
        terminal &&
        terminal.status === TerminalStatus.ONLINE &&
        (terminal.lastReportTime || 0) > info.detectedAt
      ) {
        recovered.push(terminalId);
        this.offlineTerminals.delete(terminalId);

        const event: TerminalOnlineEvent = {
          terminalId,
          offlineDuration: now - info.detectedAt,
          recoveryTime: now,
        };
        this.emit('terminal:online', event);
      }
    }

    if (recovered.length > 0) {
      logger.info('Detected recovered terminals:', {
        count: recovered.length,
        terminals: recovered.slice(0, 10),
      });
    }
  }

  public reportHeartbeat(terminalId: string): void {
    if (this.offlineTerminals.has(terminalId)) {
      this.offlineTerminals.delete(terminalId);
      logger.debug('Terminal heartbeat received, removed from offline list:', {
        terminalId,
      });
    }
  }

  public isOffline(terminalId: string): boolean {
    return this.offlineTerminals.has(terminalId);
  }

  public getOfflineCount(): number {
    return this.offlineTerminals.size;
  }

  public getOfflineTerminals(): string[] {
    return Array.from(this.offlineTerminals.keys());
  }

  public updateConfig(newConfig: Partial<DetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Liveness detector config updated:', { config: this.config });

    if (this.isRunning && newConfig.checkIntervalMs) {
      this.stop();
      this.start();
    }
  }

  public getStats(): {
    isRunning: boolean;
    offlineCount: number;
    config: DetectionConfig;
  } {
    return {
      isRunning: this.isRunning,
      offlineCount: this.offlineTerminals.size,
      config: { ...this.config },
    };
  }
}

export const terminalLivenessDetector = new TerminalLivenessDetector();
