import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { TerminalStatus } from '../../types';

@Entity('terminals')
export class Terminal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 100 })
  @Index()
  terminalId!: string;

  @Column({ length: 255, nullable: true })
  name?: string;

  @Column({
    type: 'enum',
    enum: TerminalStatus,
    default: TerminalStatus.OFFLINE,
  })
  status!: TerminalStatus;

  @Column({ type: 'float', nullable: true })
  latitude?: number;

  @Column({ type: 'float', nullable: true })
  longitude?: number;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  lastMetrics?: Record<string, number>;

  @Column({ type: 'bigint', nullable: true })
  lastReportTime?: number;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
