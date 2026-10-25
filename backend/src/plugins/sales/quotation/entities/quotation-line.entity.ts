import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

/** One panel of a version: the estimate's cost, the margin Sales sets and the price it gives. */
@Entity('sales_quotation_lines')
export class QuotationLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'version_id' })
  versionId: number;

  @Column({ type: 'varchar', length: 50 })
  tag: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  /** Cost of ONE panel as the estimate computed it, VND. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'unit_cost',
    transformer: numericColumnTransformer,
  })
  unitCost: number;

  /** Margin over the cost, percent, 0–1000, up to 2 decimals. */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    name: 'margin_percent',
    default: 0,
    transformer: numericColumnTransformer,
  })
  marginPercent: number;

  /** `round_half_up(unitCost × (1 + margin%))`, VND. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'unit_price',
    default: 0,
    transformer: numericColumnTransformer,
  })
  unitPrice: number;

  /** `unitPrice × quantity`, VND. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: numericColumnTransformer,
  })
  amount: number;
}
