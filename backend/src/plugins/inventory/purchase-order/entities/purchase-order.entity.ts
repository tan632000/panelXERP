import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';
import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

import { PurchaseOrderStatus } from '@plugins/inventory/purchase-order/enums/purchase-order-status.enum';

/**
 * A purchase order to one supplier. The code is a document number: unique over every row,
 * deleted ones included. The header is the row every write locks (`FOR UPDATE`) before it
 * moves the status with `UPDATE … WHERE status = :expected`. Money columns are whole VND;
 * compute with `decimal.js` from the stored text, never with these numbers.
 */
@Entity('purchase_orders')
export class PurchaseOrder extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'supplier_id' })
  supplierId: number;

  @Column({ type: 'date', name: 'expected_date', nullable: true })
  expectedDate?: string | null;

  @Column({ type: 'smallint', name: 'vat_rate' })
  vatRate: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 0,
    transformer: numericColumnTransformer,
  })
  subtotal: number;

  @Column({
    type: 'numeric',
    name: 'vat_amount',
    precision: 18,
    scale: 0,
    transformer: numericColumnTransformer,
  })
  vatAmount: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 0,
    transformer: numericColumnTransformer,
  })
  total: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({
    type: 'enum',
    enum: PurchaseOrderStatus,
    enumName: 'purchase_order_status',
    default: PurchaseOrderStatus.DRAFT,
  })
  status: PurchaseOrderStatus;

  /** Every user who changed the header or the lines since creation: none of them may approve. */
  @Column({
    type: 'int',
    array: true,
    name: 'editor_ids',
    default: () => "'{}'",
  })
  editorIds: number[];

  @Column({ type: 'int', name: 'submitted_by', nullable: true })
  submittedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'int', name: 'approved_by', nullable: true })
  approvedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt?: Date | null;

  @Column({ type: 'text', name: 'cancel_reason', nullable: true })
  cancelReason?: string | null;

  @Column({ type: 'int', name: 'cancelled_by', nullable: true })
  cancelledBy?: number | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'text', name: 'close_reason', nullable: true })
  closeReason?: string | null;

  @Column({ type: 'int', name: 'closed_by', nullable: true })
  closedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'closed_at', nullable: true })
  closedAt?: Date | null;
}
