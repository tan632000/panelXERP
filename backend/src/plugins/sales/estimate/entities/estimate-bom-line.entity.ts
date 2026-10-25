import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/**
 * One material of a panel. The item's code, name, brand and unit are copied when the line is
 * added, so renaming the catalog item later does not rewrite an estimate already built.
 */
@Entity('sales_estimate_bom_lines')
export class EstimateBomLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'panel_id' })
  panelId: number;

  @Column({ type: 'int', name: 'item_id' })
  itemId: number;

  @Column({ type: 'varchar', length: 64, name: 'item_code' })
  itemCode: string;

  @Column({ type: 'varchar', length: 255, name: 'item_name' })
  itemName: string;

  @Column({ type: 'varchar', length: 255, name: 'item_brand', nullable: true })
  itemBrand?: string | null;

  @Column({ type: 'varchar', length: 20, name: 'item_unit' })
  itemUnit: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 3,
    transformer: numericColumnTransformer,
  })
  quantity: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'unit_cost',
    transformer: numericColumnTransformer,
  })
  unitCost: number;

  /** `round_half_up(quantity × unitCost)` to whole VND. Computed by the server. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: numericColumnTransformer,
  })
  amount: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;
}
