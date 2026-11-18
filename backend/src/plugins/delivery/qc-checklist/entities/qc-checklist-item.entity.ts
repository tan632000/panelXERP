import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** One line of the QC checklist template shared by every cabinet; hidden, never deleted. */
@Entity('qc_checklist_items')
export class QcChecklistItem extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
