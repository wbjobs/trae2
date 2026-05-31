import { Repository, FindManyOptions } from 'typeorm';
import { AlarmEventEntity } from '../models/AlarmEvent';
import { AppDataSource } from '../data-source';
import { AlarmEvent, AlarmLevel } from '../../types';
import logger from '../../utils/logger';

export class AlarmEventRepository {
  private repository: Repository<AlarmEventEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(AlarmEventEntity);
  }

  async create(alarm: AlarmEvent): Promise<AlarmEventEntity> {
    const entity = this.repository.create({
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
    });

    return this.repository.save(entity);
  }

  async createBatch(alarms: AlarmEvent[]): Promise<AlarmEventEntity[]> {
    const entities = alarms.map((alarm) =>
      this.repository.create({
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

    return this.repository.save(entities, { chunk: 50 });
  }

  async findById(alarmId: string): Promise<AlarmEventEntity | null> {
    return this.repository.findOneBy({ id: alarmId });
  }

  async list(
    page: number = 1,
    pageSize: number = 50,
    filters?: {
      terminalId?: string;
      alarmLevel?: AlarmLevel;
      acknowledged?: boolean;
      resolved?: boolean;
      startTime?: number;
      endTime?: number;
    }
  ): Promise<{ alarms: AlarmEventEntity[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (filters?.terminalId) where.terminalId = filters.terminalId;
    if (filters?.alarmLevel) where.alarmLevel = filters.alarmLevel;
    if (filters?.acknowledged !== undefined) where.acknowledged = filters.acknowledged;
    if (filters?.resolved !== undefined) where.resolved = filters.resolved;

    const options: FindManyOptions<AlarmEventEntity> = {
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { timestamp: 'DESC' },
    };

    const [alarms, total] = await this.repository.findAndCount(options);
    return { alarms, total };
  }

  async acknowledge(alarmId: string, operator?: string): Promise<AlarmEventEntity | null> {
    const alarm = await this.findById(alarmId);
    if (!alarm) return null;

    alarm.acknowledged = true;
    alarm.acknowledgedAt = Date.now();
    alarm.acknowledgedBy = operator;

    return this.repository.save(alarm);
  }

  async resolve(alarmId: string, note?: string): Promise<AlarmEventEntity | null> {
    const alarm = await this.findById(alarmId);
    if (!alarm) return null;

    alarm.resolved = true;
    alarm.resolvedAt = Date.now();
    alarm.resolutionNote = note;

    return this.repository.save(alarm);
  }

  async getStats(): Promise<{
    total: number;
    byLevel: Record<AlarmLevel, number>;
    unacknowledged: number;
    unresolved: number;
    todayCount: number;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, unacknowledged, unresolved, todayCount] = await Promise.all([
      this.repository.count(),
      this.repository.count({ where: { acknowledged: false } }),
      this.repository.count({ where: { resolved: false } }),
      this.repository
        .createQueryBuilder()
        .where('timestamp >= :todayStart', { todayStart: todayStart.getTime() })
        .getCount(),
    ]);

    const byLevelRaw = await this.repository
      .createQueryBuilder('alarm')
      .select('alarm.alarmLevel', 'level')
      .addSelect('COUNT(*)', 'count')
      .groupBy('alarm.alarmLevel')
      .getRawMany();

    const byLevel: Record<string, number> = {};
    Object.values(AlarmLevel).forEach((level) => {
      byLevel[level] = 0;
    });

    byLevelRaw.forEach((row) => {
      byLevel[row.level] = parseInt(row.count, 10);
    });

    return {
      total,
      byLevel: byLevel as Record<AlarmLevel, number>,
      unacknowledged,
      unresolved,
      todayCount,
    };
  }

  async getTerminalAlarms(
    terminalId: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ alarms: AlarmEventEntity[]; total: number }> {
    return this.list(page, pageSize, { terminalId, resolved: false });
  }

  async bulkAcknowledge(alarmIds: string[], operator?: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(AlarmEventEntity)
      .set({
        acknowledged: true,
        acknowledgedAt: Date.now(),
        acknowledgedBy: operator,
      })
      .where('id IN (:...ids)', { ids: alarmIds })
      .andWhere('acknowledged = :acknowledged', { acknowledged: false })
      .execute();

    const updated = result.affected || 0;
    logger.info('Bulk acknowledge completed:', { count: updated });
    return updated;
  }
}

export const alarmEventRepository = new AlarmEventRepository();
