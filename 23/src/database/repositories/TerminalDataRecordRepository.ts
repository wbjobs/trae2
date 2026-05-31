import { Repository, FindManyOptions, Between } from 'typeorm';
import { TerminalDataRecord } from '../models/TerminalDataRecord';
import { AppDataSource } from '../data-source';
import { TerminalData } from '../../types';
import logger from '../../utils/logger';

export class TerminalDataRecordRepository {
  private repository: Repository<TerminalDataRecord>;

  constructor() {
    this.repository = AppDataSource.getRepository(TerminalDataRecord);
  }

  async create(data: TerminalData, validationWarnings?: string[]): Promise<TerminalDataRecord> {
    const record = this.repository.create({
      terminalId: data.terminalId,
      timestamp: data.timestamp,
      latitude: data.location.latitude,
      longitude: data.location.longitude,
      status: data.status,
      metrics: data.metrics,
      alarms: data.alarms,
      rawData: data.rawData,
      validationWarnings,
    });

    try {
      return await this.repository.save(record);
    } catch (err) {
      logger.error('Failed to save terminal data record:', err);
      throw err;
    }
  }

  async createBatch(records: Array<{ data: TerminalData; warnings?: string[] }>): Promise<TerminalDataRecord[]> {
    const entities = records.map(({ data, warnings }) =>
      this.repository.create({
        terminalId: data.terminalId,
        timestamp: data.timestamp,
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        status: data.status,
        metrics: data.metrics,
        alarms: data.alarms,
        rawData: data.rawData,
        validationWarnings: warnings,
      })
    );

    return this.repository.save(entities, { chunk: 100 });
  }

  async getByTerminalId(
    terminalId: string,
    page: number = 1,
    pageSize: number = 100,
    startTime?: number,
    endTime?: number
  ): Promise<{ records: TerminalDataRecord[]; total: number }> {
    const where: Record<string, unknown> = { terminalId };

    if (startTime && endTime) {
      where.timestamp = Between(startTime, endTime);
    } else if (startTime) {
      where.timestamp = Between(startTime, Date.now());
    }

    const options: FindManyOptions<TerminalDataRecord> = {
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { timestamp: 'DESC' },
    };

    const [records, total] = await this.repository.findAndCount(options);
    return { records, total };
  }

  async getLatestByTerminalId(terminalId: string, limit: number = 10): Promise<TerminalDataRecord[]> {
    return this.repository.find({
      where: { terminalId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async countByTerminalId(terminalId: string): Promise<number> {
    return this.repository.count({ where: { terminalId } });
  }

  async getMetricTrend(
    terminalId: string,
    metricName: string,
    startTime: number,
    endTime: number
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const records = await this.repository
      .createQueryBuilder('record')
      .select('record.timestamp', 'timestamp')
      .addSelect(`JSON_EXTRACT(record.metrics, '$."${metricName}"')`, 'value')
      .where('record.terminalId = :terminalId', { terminalId })
      .andWhere('record.timestamp BETWEEN :startTime AND :endTime', { startTime, endTime })
      .andWhere(`JSON_EXTRACT(record.metrics, '$."${metricName}"') IS NOT NULL`)
      .orderBy('record.timestamp', 'ASC')
      .getRawMany();

    return records.map((r) => ({
      timestamp: parseInt(r.timestamp, 10),
      value: parseFloat(r.value),
    }));
  }

  async deleteOldRecords(olderThanDays: number = 90): Promise<number> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoffTime', { cutoffTime })
      .execute();

    const deletedCount = result.affected || 0;
    logger.info('Old records deleted:', { count: deletedCount, olderThanDays });
    return deletedCount;
  }
}

export const terminalDataRecordRepository = new TerminalDataRecordRepository();
