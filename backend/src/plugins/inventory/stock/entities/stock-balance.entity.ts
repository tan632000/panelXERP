import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/**
 * The stock of one item. Written only by `StockPostingService`, which locks the row first;
 * `value` is the stock value in whole VND, so the average cost is `value / onHand`.
 */
@Entity('stock_balances')
export class StockBalance {
  @PrimaryColumn({ type: 'int', name: 'item_id' })
  itemId: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 3,
    name: 'on_hand',
    transformer: numericColumnTransformer,
  })
  onHand: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 3,
    transformer: numericColumnTransformer,
  })
  reserved: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: numericColumnTransformer,
  })
  value: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
