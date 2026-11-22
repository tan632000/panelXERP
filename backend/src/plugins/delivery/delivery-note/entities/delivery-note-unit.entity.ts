import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/**
 * A cabinet on a note. `active` is true while the note is not cancelled; the partial unique
 * index over active lines is the database backstop of "a cabinet is on one live note".
 */
@Entity('delivery_note_units')
export class DeliveryNoteUnit extends BaseEntity {
  @Column({ type: 'int', name: 'note_id' })
  noteId: number;

  @Column({ type: 'int', name: 'unit_id' })
  unitId: number;

  /** Copy of the cabinet code, so the note keeps its wording. */
  @Column({ type: 'varchar', length: 60, name: 'unit_code' })
  unitCode: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
