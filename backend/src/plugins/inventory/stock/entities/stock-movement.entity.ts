import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';

/** One append-only ledger row: a signed quantity and the signed value it moved. */
@Entity('stock_movements')
export class StockMovement {
  /** `bigserial`, which `pg` returns as a string. */
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'int', name: 'item_id' })
  itemId: number;

  @Column({
    type: 'enum',
    enum: StockMovementType,
    enumName: 'stock_movement_type',
    name: 'movement_type',
  })
  movementType: StockMovementType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 3,
    transformer: numericColumnTransformer,
  })
  quantity: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    name: 'unit_cost',
    transformer: numericColumnTransformer,
  })
  unitCost: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: numericColumnTransformer,
  })
  value: number;

  /** What the returned quantity was worth on its purchase order; supplier returns only. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'reference_value',
    nullable: true,
    transformer: numericColumnTransformer,
  })
  referenceValue?: number | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 3,
    name: 'on_hand_after',
    transformer: numericColumnTransformer,
  })
  onHandAfter: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    name: 'avg_cost_after',
    transformer: numericColumnTransformer,
  })
  avgCostAfter: number;

  @Column({ type: 'varchar', length: 32, name: 'document_type' })
  documentType: string;

  @Column({ type: 'int', name: 'document_id' })
  documentId: number;

  @Column({ type: 'int', name: 'document_line_id', nullable: true })
  documentLineId?: number | null;

  @Column({ type: 'int', name: 'order_id', nullable: true })
  orderId?: number | null;

  @Column({ type: 'int', name: 'order_line_id', nullable: true })
  orderLineId?: number | null;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
