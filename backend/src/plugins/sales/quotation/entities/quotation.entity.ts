import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/**
 * The quotation of one request. The code is a document number: unique over every row, deleted
 * ones included. Versions hold the content; the header names the newest one (`latestVer`) and
 * is the row every write locks, so versions are never created or edited against a status read
 * before another writer committed. Visibility follows the request's sales owner.
 */
@Entity('sales_quotations')
export class Quotation extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'request_id' })
  requestId: number;

  @Column({ type: 'int', name: 'estimate_id' })
  estimateId: number;

  @Column({ type: 'int', name: 'latest_ver', default: 1 })
  latestVer: number;
}
