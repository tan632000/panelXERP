import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

const money = {
  type: 'numeric',
  precision: 18,
  scale: 2,
  transformer: numericColumnTransformer,
} as const;

/** One panel of the order, as the confirmed quotation priced it; a copy, never a reference. */
@Entity('sales_order_lines')
export class SalesOrderLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'order_id' })
  orderId: number;

  @Column({ type: 'varchar', length: 50 })
  tag: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ ...money, name: 'unit_price' })
  unitPrice: number;

  @Column({ ...money })
  amount: number;
}
