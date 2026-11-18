import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** One QC inspection of one cabinet; never edited once submitted. */
@Entity('qc_rounds')
export class QcRound extends BaseEntity {
  @Column({ type: 'int', name: 'unit_id' })
  unitId: number;

  @Column({ type: 'int', name: 'round_no' })
  roundNo: number;

  @Column({ type: 'int', name: 'inspector_id' })
  inspectorId: number;

  @Column({ type: 'timestamptz', name: 'inspected_at' })
  inspectedAt: Date;

  @Column({ type: 'varchar', length: 10 })
  result: string;
}
