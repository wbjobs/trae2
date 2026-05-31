import { Repository, FindManyOptions } from 'typeorm';
import { Terminal } from '../models/Terminal';
import { AppDataSource } from '../data-source';
import { TerminalStatus, TerminalData } from '../../types';
import logger from '../../utils/logger';

export class TerminalRepository {
  private repository: Repository<Terminal>;

  constructor() {
    this.repository = AppDataSource.getRepository(Terminal);
  }

  async findByTerminalId(terminalId: string): Promise<Terminal | null> {
    return this.repository.findOneBy({ terminalId });
  }

  async list(
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ terminals: Terminal[]; total: number }> {
    const options: FindManyOptions<Terminal> = {
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { updatedAt: 'DESC' },
    };
    const [terminals, total] = await this.repository.findAndCount(options);
    return { terminals, total };
  }

  async createOrUpdate(data: TerminalData): Promise<Terminal> {
    return await AppDataSource.transaction(async (transactionalEntityManager) => {
      let terminal = await transactionalEntityManager.findOneBy(Terminal, {
        terminalId: data.terminalId,
      });

      if (!terminal) {
        try {
          terminal = this.repository.create({
            terminalId: data.terminalId,
            status: data.status,
            latitude: data.location.latitude,
            longitude: data.location.longitude,
            lastMetrics: data.metrics,
            lastReportTime: data.timestamp,
            isActive: true,
          });
          return await transactionalEntityManager.save(terminal);
        } catch (err) {
          if (
            err instanceof Error &&
            (err.message.includes('Duplicate entry') ||
              err.message.includes('ER_DUP_ENTRY'))
          ) {
            logger.warn('Duplicate terminal on insert, loading existing:', {
              terminalId: data.terminalId,
            });
            terminal = await transactionalEntityManager.findOneBy(Terminal, {
              terminalId: data.terminalId,
            });
            if (!terminal) {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }

      terminal.status = data.status;
      terminal.latitude = data.location.latitude;
      terminal.longitude = data.location.longitude;
      terminal.lastMetrics = data.metrics as unknown as Record<string, number>;
      terminal.lastReportTime = data.timestamp;

      return await transactionalEntityManager.save(terminal);
    });
  }

  async createOrUpdateOptimized(data: TerminalData): Promise<Terminal> {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      let terminal = await queryRunner.manager.findOneBy(Terminal, {
        terminalId: data.terminalId,
      });

      if (!terminal) {
        terminal = this.repository.create({
          terminalId: data.terminalId,
          status: data.status,
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          lastMetrics: data.metrics,
          lastReportTime: data.timestamp,
          isActive: true,
        });

        try {
          await queryRunner.manager.save(terminal);
          await queryRunner.commitTransaction();
          logger.info('New terminal registered:', { terminalId: data.terminalId });
          return terminal;
        } catch (err) {
          if (
            err instanceof Error &&
            (err.message.includes('Duplicate entry') ||
              err.message.includes('ER_DUP_ENTRY'))
          ) {
            await queryRunner.rollbackTransaction();
            await queryRunner.startTransaction();

            terminal = await queryRunner.manager.findOneBy(Terminal, {
              terminalId: data.terminalId,
            });
            if (!terminal) {
              throw new Error(
                `Terminal ${data.terminalId} not found after duplicate error`
              );
            }

            terminal.status = data.status;
            terminal.latitude = data.location.latitude;
            terminal.longitude = data.location.longitude;
            terminal.lastMetrics = data.metrics as unknown as Record<string, number>;
            terminal.lastReportTime = data.timestamp;

            await queryRunner.manager.save(terminal);
            await queryRunner.commitTransaction();
            return terminal;
          } else {
            await queryRunner.rollbackTransaction();
            throw err;
          }
        }
      }

      terminal.status = data.status;
      terminal.latitude = data.location.latitude;
      terminal.longitude = data.location.longitude;
      terminal.lastMetrics = data.metrics as unknown as Record<string, number>;
      terminal.lastReportTime = data.timestamp;

      await queryRunner.manager.save(terminal);
      await queryRunner.commitTransaction();
      return terminal;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      logger.error('Error in createOrUpdateOptimized:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async updateStatus(
    terminalId: string,
    status: TerminalStatus
  ): Promise<Terminal | null> {
    const terminal = await this.findByTerminalId(terminalId);
    if (!terminal) return null;

    terminal.status = status;
    return this.repository.save(terminal);
  }

  async countByStatus(): Promise<Record<TerminalStatus, number>> {
    const result = await this.repository
      .createQueryBuilder('terminal')
      .select('terminal.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('terminal.status')
      .getRawMany();

    const counts: Record<string, number> = {};
    Object.values(TerminalStatus).forEach((status) => {
      counts[status] = 0;
    });

    result.forEach((row) => {
      counts[row.status] = parseInt(row.count, 10);
    });

    return counts as Record<TerminalStatus, number>;
  }

  async getOnlineTerminals(): Promise<Terminal[]> {
    return this.repository.find({
      where: { status: TerminalStatus.ONLINE, isActive: true },
      order: { updatedAt: 'DESC' },
    });
  }

  async setActive(
    terminalId: string,
    isActive: boolean
  ): Promise<Terminal | null> {
    const terminal = await this.findByTerminalId(terminalId);
    if (!terminal) return null;

    terminal.isActive = isActive;
    return this.repository.save(terminal);
  }
}

export const terminalRepository = new TerminalRepository();
