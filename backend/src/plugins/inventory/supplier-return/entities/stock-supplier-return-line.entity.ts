import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** One purchase order line returned, at that line's price excluding VAT. */
@Entity('stock_supplier_return_lines')
export class StockSupplierReturnLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'return_id' })
  returnId: number;

  @Column({ type: 'int', name: 'po_line_id' })
  poLineId: number;

  @Column({ type: 'int', name: 'item_id' })
  itemId: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 3,
    transformer: numericColumnTransformer,
  })
  quantity: number;

  @Column({
    type: 'numeric',
    name: 'unit_cost',
    precision: 18,
    scale: 0,
    transformer: numericColumnTransformer,
  })
  unitCost: number;

  /** Signed like the movement: the real change of the stock value. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: numericColumnTransformer,
  })
  value: number;

  /** What the returned goods were worth on the purchase order. */
  @Column({
    type: 'numeric',
    name: 'reference_value',
    precision: 18,
    scale: 2,
    transformer: numericColumnTransformer,
  })
  referenceValue: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
