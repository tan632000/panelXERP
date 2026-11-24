import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { EstimateAiRunStatus } from '@plugins/sales/estimate/enums/estimate-ai-run-status.enum';

/**
 * One AI run that fills an estimate draft for a request. A request has at most one queued or
 * running run (partial unique index); `error` holds a typed code and a fixed sentence, never text
 * from the AI provider.
 */
@Entity('sales_estimate_ai_runs')
export class EstimateAiRun {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'request_id' })
  requestId: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: EstimateAiRunStatus.QUEUED,
  })
  status: EstimateAiRunStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  error?: string | null;

  @Column({ type: 'int', name: 'estimate_id', nullable: true })
  estimateId?: number | null;

  @Column({ type: 'text', nullable: true })
  summary?: string | null;

  @Column({ type: 'int', name: 'created_by' })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
