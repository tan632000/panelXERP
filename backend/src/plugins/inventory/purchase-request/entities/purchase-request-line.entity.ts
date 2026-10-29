import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** One item requested, optionally for the sales order whose shortage raised it. */
@Entity('purchase_request_lines')
export class PurchaseRequestLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'request_id' })
  requestId: number;

  @Column({ type: 'int', name: 'line_no' })
  lineNo: number;

  @Column({ type: 'int', name: 'item_id' })
  itemId: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 3,
    transformer: numericColumnTransformer,
  })
  quantity: number;

  @Column({ type: 'date', name: 'needed_by', nullable: true })
  neededBy?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** The sales order it was raised for; no foreign key (see the migration). */
  @Column({ type: 'int', name: 'source_order_id', nullable: true })
  sourceOrderId?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
