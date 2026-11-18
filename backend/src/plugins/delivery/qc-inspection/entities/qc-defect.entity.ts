import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** What a failed checklist item opened: `open → fixed → verified`. */
@Entity('qc_defects')
export class QcDefect extends BaseEntity {
  @Column({ type: 'int', name: 'unit_id' })
  unitId: number;

  @Column({ type: 'int', name: 'round_item_id' })
  roundItemId: number;

  @Column({ type: 'varchar', length: 1000 })
  description: string;

  @Column({ type: 'varchar', length: 10, default: 'open' })
  status: string;

  @Column({ type: 'varchar', length: 1000, name: 'fix_note', nullable: true })
  fixNote?: string | null;

  @Column({ type: 'int', name: 'fixed_by', nullable: true })
  fixedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'fixed_at', nullable: true })
  fixedAt?: Date | null;

  @Column({ type: 'int', name: 'verified_by', nullable: true })
  verifiedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'verified_at', nullable: true })
  verifiedAt?: Date | null;
}
