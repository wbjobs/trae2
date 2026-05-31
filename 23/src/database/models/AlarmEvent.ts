import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Terminal } from './Terminal';
import { AlarmLevel } from '../../types';

@Entity('alarm_events')
@Index(['terminalId', 'timestamp', 'alarmLevel'])
export class AlarmEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  @Index()
  terminalId!: string;

  @ManyToOne(() => Terminal)
  @JoinColumn({ name: 'terminalId', referencedColumnName: 'terminalId' })
  terminal?: Terminal;

  @Column({ length: 100 })
  metricName!: string;

  @Column({ type: 'float' })
  metricValue!: number;

  @Column({
    type: 'enum',
    enum: AlarmLevel,
  })
  @Index()
  alarmLevel!: AlarmLevel;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'bigint' })
  @Index()
  timestamp!: number;

  @Column({ type: 'json', nullable: true })
  thresholdRule?: Record<string, unknown>;

  @Column({ default: false })
  acknowledged!: boolean;

  @Column({ type: 'bigint', nullable: true })
  acknowledgedAt?: number;

  @Column({ length: 100, nullable: true })
  acknowledgedBy?: string;

  @Column({ default: false })
  resolved!: boolean;

  @Column({ type: 'bigint', nullable: true })
  resolvedAt?: number;

  @Column({ type: 'text', nullable: true })
  resolutionNote?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
