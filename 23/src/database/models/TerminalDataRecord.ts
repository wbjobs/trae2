import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Terminal } from './Terminal';
import { TerminalStatus } from '../../types';

@Entity('terminal_data_records')
@Index(['terminalId', 'timestamp'])
export class TerminalDataRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  @Index()
  terminalId!: string;

  @ManyToOne(() => Terminal)
  @JoinColumn({ name: 'terminalId', referencedColumnName: 'terminalId' })
  terminal?: Terminal;

  @Column({ type: 'bigint' })
  @Index()
  timestamp!: number;

  @Column({ type: 'float', nullable: true })
  latitude?: number;

  @Column({ type: 'float', nullable: true })
  longitude?: number;

  @Column({
    type: 'enum',
    enum: TerminalStatus,
  })
  status!: TerminalStatus;

  @Column({ type: 'json' })
  metrics!: Record<string, number>;

  @Column({ type: 'simple-array', nullable: true })
  alarms?: string[];

  @Column({ type: 'json', nullable: true })
  rawData?: Record<string, unknown>;

  @Column({ type: 'simple-array', nullable: true })
  validationWarnings?: string[];

  @CreateDateColumn()
  createdAt!: Date;
}
