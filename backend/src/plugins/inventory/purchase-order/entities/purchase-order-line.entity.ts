import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/**
 * One item ordered, with the item's code, name and unit as they were when it was ordered.
 * `received_qty` is the net quantity received, written by the stock receipt and supplier
 * return documents under the header lock.
 */
@Entity('purchase_order_lines')
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'purchase_order_id' })
  purchaseOrderId: number;

  @Column({ type: 'int', name: 'line_no' })
  lineNo: number;

  @Column({ type: 'int', name: 'item_id' })
  itemId: number;

  @Column({ type: 'varchar', name: 'item_code', length: 64 })
  itemCode: string;

  @Column({ type: 'varchar', name: 'item_name', length: 255 })
  itemName: string;

  @Column({ type: 'varchar', name: 'item_unit', length: 20 })
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
    name: 'unit_price',
    precision: 18,
    scale: 0,
    transformer: numericColumnTransformer,
  })
  unitPrice: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 0,
    transformer: numericColumnTransformer,
  })
  amount: number;

  @Column({
    type: 'numeric',
    name: 'received_qty',
    precision: 18,
    scale: 3,
    default: 0,
    transformer: numericColumnTransformer,
  })
  receivedQty: number;

  /** The purchase request line it came from; no foreign key (see the migration). */
  @Column({ type: 'int', name: 'pr_line_id', nullable: true })
  prLineId?: number | null;

  /** The sales order it was bought for; no foreign key (see the migration). */
  @Column({ type: 'int', name: 'source_order_id', nullable: true })
  sourceOrderId?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
