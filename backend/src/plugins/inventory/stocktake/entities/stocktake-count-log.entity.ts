import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** One save of a counted quantity: who, what and the book quantity then. Append-only. */
@Entity('stocktake_count_log')
export class StocktakeCountLog {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'line_id' })
  lineId: number;

  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @Column({
    type: 'numeric',
    name: 'counted_qty',
    precision: 18,
    scale: 3,
    transformer: numericColumnTransformer,
  })
  countedQty: number;

  @Column({
    type: 'numeric',
    name: 'book_qty',
    precision: 18,
    scale: 3,
    transformer: numericColumnTransformer,
  })
  bookQty: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
