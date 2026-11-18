import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** One checklist line as the round saw it: name and position are copies of the template. */
@Entity('qc_round_items')
export class QcRoundItem extends BaseEntity {
  @Column({ type: 'int', name: 'round_id' })
  roundId: number;

  @Column({ type: 'int', name: 'checklist_item_id' })
  checklistItemId: number;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'varchar', length: 4 })
  result: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note?: string | null;
}
