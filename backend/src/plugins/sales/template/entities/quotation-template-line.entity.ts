import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** One part of a panel. The item is looked up live; the template stores no name or price. */
@Entity('quotation_template_lines')
export class QuotationTemplateLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'panel_id' })
  panelId: number;

  @Column({ type: 'int', name: 'item_id' })
  itemId: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 3,
    transformer: numericColumnTransformer,
  })
  quantity: number;

  /** The load group the source sheet lists the line under; display and AI hint only. */
  @Column({ type: 'varchar', length: 255, name: 'group_label', nullable: true })
  groupLabel?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;
}
