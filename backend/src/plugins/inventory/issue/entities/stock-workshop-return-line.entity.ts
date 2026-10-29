import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** One item returned, at the order's net issued average cost of that item. */
@Entity('stock_workshop_return_lines')
export class StockWorkshopReturnLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'return_id' })
  returnId: number;

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

  /** Signed like the movement: positive, stock came back. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: numericColumnTransformer,
  })
  value: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
