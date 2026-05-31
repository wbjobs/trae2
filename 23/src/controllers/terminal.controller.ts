import { Request, Response } from 'express';
import { TerminalData, PaginatedResponse } from '../types';
import { AppDataSource } from '../database/data-source';
import { Terminal } from '../database/models/Terminal';
import { TerminalDataRecord } from '../database/models/TerminalDataRecord';
import { AlarmEventEntity } from '../database/models/AlarmEvent';
import { terminalRepository } from '../database/repositories/TerminalRepository';
import { terminalDataRecordRepository } from '../database/repositories/TerminalDataRecordRepository';
import { alarmEventRepository } from '../database/repositories/AlarmEventRepository';
import { thresholdEngine } from '../services/threshold-engine.service';
import { messageQueueService } from '../services/message-queue.service';
import { dataProcessingPipeline } from '../services/data-pipeline.service';
import { terminalLivenessDetector } from '../services/terminal-liveness.service';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class TerminalController {
  async reportData(req: Request, res: Response): Promise<void> {
    const data = req.body as TerminalData;
    const requestId = req.requestId;
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      const pipelineResult = await dataProcessingPipeline.process(data, requestId);

      if (!pipelineResult.success) {
        logger.warn('Data pipeline validation failed:', {
          terminalId: data.terminalId,
          errors: pipelineResult.errors,
          requestId,
        });
        res.status(400).json({
          success: false,
          code: 400,
          message: 'Data validation failed',
          errors: pipelineResult.errors,
          warnings: pipelineResult.warnings,
          timestamp: Date.now(),
          requestId,
        });
        return;
      }

      const processedData = pipelineResult.data;
      const warnings = pipelineResult.warnings;

      terminalLivenessDetector.reportHeartbeat(data.terminalId);

      await queryRunner.connect();
      await queryRunner.startTransaction();

      let terminal = await queryRunner.manager.findOneBy(Terminal, {
        terminalId: processedData.terminalId,
      });

      if (!terminal) {
        terminal = queryRunner.manager.create(Terminal, {
          terminalId: processedData.terminalId,
          status: processedData.status,
          latitude: processedData.location.latitude,
          longitude: processedData.location.longitude,
          lastMetrics: processedData.metrics as unknown as Record<string, number>,
          lastReportTime: processedData.timestamp,
          isActive: true,
        });

        try {
          await queryRunner.manager.save(terminal);
        } catch (err) {
          if (
            err instanceof Error &&
            (err.message.includes('Duplicate entry') ||
              err.message.includes('ER_DUP_ENTRY'))
          ) {
            logger.warn('Duplicate terminal on insert, loading existing:', {
              terminalId: processedData.terminalId,
              requestId,
            });
            terminal = await queryRunner.manager.findOneBy(Terminal, {
              terminalId: processedData.terminalId,
            });
            if (!terminal) {
              throw new Error(
                `Terminal ${processedData.terminalId} not found after duplicate error`
              );
            }
          } else {
            throw err;
          }
        }
      } else {
        terminal.status = processedData.status;
        terminal.latitude = processedData.location.latitude;
        terminal.longitude = processedData.location.longitude;
        terminal.lastMetrics = processedData.metrics as unknown as Record<string, number>;
        terminal.lastReportTime = processedData.timestamp;
        await queryRunner.manager.save(terminal);
      }

      const dataRecord = queryRunner.manager.create(TerminalDataRecord, {
        terminalId: processedData.terminalId,
        timestamp: processedData.timestamp,
        latitude: processedData.location.latitude,
        longitude: processedData.location.longitude,
        status: processedData.status,
        metrics: processedData.metrics,
        alarms: processedData.alarms,
        rawData: processedData.rawData,
        validationWarnings: warnings,
      });
      await queryRunner.manager.save(dataRecord);

      const evaluateResult = thresholdEngine.evaluate(processedData);
      const alarms = evaluateResult.alarms;
      const adjustments = evaluateResult.adjustments;
      let alarmsGenerated = 0;

      if (alarms.length > 0) {
        logger.info('Threshold alarms generated:', {
          terminalId: processedData.terminalId,
          alarmCount: alarms.length,
          adjustmentCount: adjustments.length,
          requestId,
        });

        const alarmEntities = alarms.map((alarm) =>
          queryRunner.manager.create(AlarmEventEntity, {
            id: alarm.id,
            terminalId: alarm.terminalId,
            metricName: alarm.metricName,
            metricValue: alarm.metricValue,
            alarmLevel: alarm.alarmLevel,
            message: alarm.message,
            timestamp: alarm.timestamp,
            thresholdRule: alarm.thresholdRule as unknown as Record<string, unknown>,
            acknowledged: alarm.acknowledged,
            resolved: alarm.resolved,
          })
        );

        await queryRunner.manager.save(alarmEntities, { chunk: 50 });
        alarmsGenerated = alarms.length;
      }

      await queryRunner.commitTransaction();

      if (alarms.length > 0) {
        messageQueueService
          .publishBatchAlarms(alarms)
          .then((results) => {
            const failedCount = results.filter((r) => !r).length;
            if (failedCount > 0) {
              logger.warn('Some alarms failed to publish to queue:', {
                terminalId: processedData.terminalId,
                failedCount,
                totalCount: alarms.length,
                requestId,
              });
            }
          })
          .catch((err) => {
            logger.error('Failed to publish alarms to queue:', err);
          });
      }

      messageQueueService.publishData(processedData, uuidv4()).catch((err) => {
        logger.debug('Failed to publish data to queue:', err);
      });

      res.sendSuccess(
        {
          received: true,
          terminalId: processedData.terminalId,
          alarmsGenerated,
          warnings,
          adjustments: adjustments.length > 0 ? adjustments : undefined,
          pipelineDuration: pipelineResult.duration,
        },
        'Data received and processed successfully'
      );
    } catch (err) {
      await queryRunner.rollbackTransaction();

      logger.error('Error processing terminal data:', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        terminalId: data.terminalId,
        requestId,
      });
      res.sendError('Failed to process data', 500);
    } finally {
      await queryRunner.release();
    }
  }

  async getStatus(req: Request, res: Response): Promise<void> {
    const { terminalId } = req.params;

    try {
      const terminal = await terminalRepository.findByTerminalId(terminalId);

      if (!terminal) {
        res.sendError('Terminal not found', 404);
        return;
      }

      const latestRecords =
        await terminalDataRecordRepository.getLatestByTerminalId(terminalId, 1);
      const { alarms } = await alarmEventRepository.getTerminalAlarms(
        terminalId,
        1,
        10
      );

      const isOffline = terminalLivenessDetector.isOffline(terminalId);

      res.sendSuccess({
        terminal,
        latestData: latestRecords[0] || null,
        activeAlarms: alarms,
        isOffline,
      });
    } catch (err) {
      logger.error('Error getting terminal status:', err);
      res.sendError('Failed to get terminal status', 500);
    }
  }

  async getHistory(req: Request, res: Response): Promise<void> {
    const { terminalId } = req.params;
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 100;
    const startTime = req.query.startTime
      ? parseInt(req.query.startTime as string, 10)
      : undefined;
    const endTime = req.query.endTime
      ? parseInt(req.query.endTime as string, 10)
      : undefined;

    try {
      const { records, total } =
        await terminalDataRecordRepository.getByTerminalId(
          terminalId,
          page,
          pageSize,
          startTime,
          endTime
        );

      const response: PaginatedResponse<(typeof records)[0]> = {
        items: records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      res.sendSuccess(response);
    } catch (err) {
      logger.error('Error getting terminal history:', err);
      res.sendError('Failed to get history', 500);
    }
  }

  async getAlarms(req: Request, res: Response): Promise<void> {
    const { terminalId } = req.params;
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50;

    try {
      const { alarms, total } = await alarmEventRepository.getTerminalAlarms(
        terminalId,
        page,
        pageSize
      );

      const response: PaginatedResponse<(typeof alarms)[0]> = {
        items: alarms,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      res.sendSuccess(response);
    } catch (err) {
      logger.error('Error getting terminal alarms:', err);
      res.sendError('Failed to get alarms', 500);
    }
  }

  async listTerminals(req: Request, res: Response): Promise<void> {
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50;

    try {
      const { terminals, total } = await terminalRepository.list(page, pageSize);
      const statusCounts = await terminalRepository.countByStatus();
      const offlineCount = terminalLivenessDetector.getOfflineCount();

      const response: PaginatedResponse<(typeof terminals)[0]> = {
        items: terminals,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      res.sendSuccess({
        ...response,
        statusCounts,
        detectedOfflineCount: offlineCount,
      });
    } catch (err) {
      logger.error('Error listing terminals:', err);
      res.sendError('Failed to list terminals', 500);
    }
  }
}
