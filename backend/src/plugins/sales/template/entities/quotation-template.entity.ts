import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** A reusable panel and part list, priced by nobody: Sales prices the estimate it seeds. */
@Entity('quotation_templates')
export class QuotationTemplate extends BaseEntity {
  /** Business code `TPL_xxxx`, unique among live rows (a deleted template frees it). */
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** Only an active template can be picked by a project. */
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}
