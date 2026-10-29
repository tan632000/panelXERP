import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** One item issued, optionally for one panel line of the order, at the average it left at. */
@Entity('stock_issue_lines')
export class StockIssueLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'issue_id' })
  issueId: number;

  @Column({ type: 'int', name: 'item_id' })
  itemId: number;

  /** The panel line of the order; no foreign key (see the migration). */
  @Column({ type: 'int', name: 'order_line_id', nullable: true })
  orderLineId?: number | null;

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
    scale: 4,
    transformer: numericColumnTransformer,
  })
  unitCost: number;

  /** Signed like the movement: negative, stock left. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: numericColumnTransformer,
  })
  value: number;

  /** Why more than the BOM was issued; required once the order's issues exceed it. */
  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
