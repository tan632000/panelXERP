import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';
import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

import { EstimateRevisionStatus } from '@plugins/sales/estimate/enums/estimate-revision-status.enum';

/**
 * The estimate of one request. The code is a document number: unique over every row, deleted
 * ones included. Revisions hold the content; the header mirrors the latest one (`status`,
 * `latestRevision`, `total`) so lists read it without joining, and it is the row every write
 * locks to keep revisions from being created or submitted twice.
 */
@Entity('sales_estimates')
export class Estimate extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'request_id' })
  requestId: number;

  /** Status of the latest revision: `draft` while one is being edited, else `submitted`. */
  @Column({
    type: 'varchar',
    length: 20,
    default: EstimateRevisionStatus.DRAFT,
  })
  status: EstimateRevisionStatus;

  @Column({ type: 'int', name: 'latest_revision', default: 1 })
  latestRevision: number;

  /** Total of the latest revision, VND. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: numericColumnTransformer,
  })
  total: number;
}
