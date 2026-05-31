import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AlarmLevel } from '../../types';

@Entity('threshold_rules')
@Index(['metricName', 'enabled'])
export class ThresholdRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  @Index()
  metricName!: string;

  @Column({ length: 100, nullable: true })
  terminalType?: string;

  @Column({ length: 100, nullable: true })
  terminalId?: string;

  @Column({ type: 'float', nullable: true })
  minValue?: number;

  @Column({ type: 'float', nullable: true })
  maxValue?: number;

  @Column({
    type: 'enum',
    enum: AlarmLevel,
  })
  alarmLevel!: AlarmLevel;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'text' })
  description!: string;

  @Column({ default: 1 })
  consecutiveCount!: number;

  @Column({ default: 300000 })
  cooldownPeriod!: number;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
