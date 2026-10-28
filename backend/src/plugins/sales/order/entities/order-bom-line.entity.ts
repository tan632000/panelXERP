import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** A material of an order line, copied from the quotation's frozen BOM. */
@Entity('sales_order_bom_lines')
export class SalesOrderBomLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'line_id' })
  lineId: number;

  /**
   * The catalog item the line was taken from. Null only on a legacy row the backfill could not
   * link; demand never joins by code, because a code can be reused after its item is deleted.
   */
  @Column({ type: 'int', name: 'item_id', nullable: true })
  itemId: number | null;

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
}
