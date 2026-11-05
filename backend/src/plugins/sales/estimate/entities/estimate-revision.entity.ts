import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

import { EstimateRevisionStatus } from '@plugins/sales/estimate/enums/estimate-revision-status.enum';

/** One numbered version of an estimate; removed only with its estimate. */
@Entity('sales_estimate_revisions')
export class EstimateRevision {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'estimate_id' })
  estimateId: number;

  /** 1, 2, 3… unique within the estimate. */
  @Column({ type: 'int' })
  revision: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: EstimateRevisionStatus.DRAFT,
  })
  status: EstimateRevisionStatus;

  /** Σ panel totals, VND; computed by the server on every change. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: numericColumnTransformer,
  })
  total: number;

  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'int', name: 'submitted_by', nullable: true })
  submittedBy?: number | null;

  /** When sales marked the submitted revision priced; null until then, and always null on a draft. */
  @Column({ type: 'timestamptz', name: 'priced_at', nullable: true })
  pricedAt?: Date | null;

  @Column({ type: 'int', name: 'priced_by', nullable: true })
  pricedBy?: number | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
