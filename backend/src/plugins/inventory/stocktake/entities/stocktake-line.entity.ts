import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/**
 * One item of a count: what was counted and the book quantity at that moment. Nothing counted
 * means nothing posts; the cost and value are set when the count is approved.
 */
@Entity('stocktake_lines')
export class StocktakeLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'stocktake_id' })
  stocktakeId: number;

  @Column({ type: 'int', name: 'item_id' })
  itemId: number;

  @Column({
    type: 'numeric',
    name: 'counted_qty',
    precision: 18,
    scale: 3,
    nullable: true,
    transformer: numericColumnTransformer,
  })
  countedQty?: number | null;

  @Column({
    type: 'numeric',
    name: 'book_qty',
    precision: 18,
    scale: 3,
    nullable: true,
    transformer: numericColumnTransformer,
  })
  bookQty?: number | null;

  @Column({ type: 'timestamptz', name: 'counted_at', nullable: true })
  countedAt?: Date | null;

  @Column({
    type: 'numeric',
    name: 'unit_cost',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: numericColumnTransformer,
  })
  unitCost?: number | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: numericColumnTransformer,
  })
  value?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
