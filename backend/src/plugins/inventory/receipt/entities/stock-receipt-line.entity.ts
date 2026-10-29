import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** One purchase order line received, at that line's price excluding VAT. */
@Entity('stock_receipt_lines')
export class StockReceiptLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'receipt_id' })
  receiptId: number;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
