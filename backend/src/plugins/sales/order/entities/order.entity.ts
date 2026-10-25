import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';
import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

import { OrderStatus } from '@plugins/sales/order/enums/order-status.enum';

/** Whole-VND figure copied from the confirmed quotation version. */
const money = {
  type: 'numeric',
  precision: 18,
  scale: 2,
  default: 0,
  transformer: numericColumnTransformer,
} as const;

/**
 * The sales order made from a customer-confirmed quotation version. Everything it shows is a
 * copy taken at conversion — customer, project, payment terms, lines and totals — so a later
 * edit of the quotation, the estimate or the customer never changes it. Orders are never
 * deleted, only cancelled, so the code and `quotation_id` unique indexes count every row: a
 * cancelled order still blocks a second conversion of its quotation.
 */
@Entity('sales_orders')
export class SalesOrder extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'quotation_id' })
  quotationId: number;

  @Column({ type: 'int', name: 'quotation_version_id' })
  quotationVersionId: number;

  /** The version's number, kept for display. */
  @Column({ type: 'int', name: 'quotation_ver' })
  quotationVer: number;

  @Column({ type: 'int', name: 'request_id' })
  requestId: number;

  @Column({ type: 'int', name: 'estimate_id' })
  estimateId: number;

  @Column({ type: 'int', name: 'estimate_revision_id' })
  estimateRevisionId: number;

  /** That revision's number, kept for display. */
  @Column({ type: 'int', name: 'estimate_revision' })
  estimateRevision: number;

  @Column({ type: 'int', name: 'customer_id' })
  customerId: number;

  @Column({ type: 'varchar', length: 255, name: 'customer_name' })
  customerName: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'customer_tax_code',
    nullable: true,
  })
  customerTaxCode?: string | null;

  @Column({ type: 'text', name: 'customer_address', nullable: true })
  customerAddress?: string | null;

  @Column({ type: 'int', name: 'project_id', nullable: true })
  projectId?: number | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'project_name',
    nullable: true,
  })
  projectName?: string | null;

  @Column({ type: 'varchar', length: 100, name: 'contract_no', nullable: true })
  contractNo?: string | null;

  /** Calendar date as `YYYY-MM-DD`; no time zone applies to it. */
  @Column({ type: 'date', name: 'contract_date', nullable: true })
  contractDate?: string | null;

  /** Calendar date as `YYYY-MM-DD`; no time zone applies to it. */
  @Column({ type: 'date', name: 'delivery_date', nullable: true })
  deliveryDate?: string | null;

  /** The payment and delivery terms of the confirmed version, as printed on the quotation. */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  terms: string[];

  @Column({ type: 'varchar', length: 20, default: OrderStatus.OPEN })
  status: OrderStatus;

  @Column({
    type: 'varchar',
    length: 1000,
    name: 'cancel_reason',
    nullable: true,
  })
  cancelReason?: string | null;

  @Column({ type: 'int', name: 'cancelled_by', nullable: true })
  cancelledBy?: number | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt?: Date | null;

  @Column({ ...money })
  subtotal: number;

  @Column({ ...money, name: 'discount_amount' })
  discountAmount: number;

  @Column({ ...money })
  taxable: number;

  /** VAT rate in percent. */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    name: 'vat_rate',
    default: 8,
    transformer: numericColumnTransformer,
  })
  vatRate: number;

  @Column({ ...money, name: 'vat_amount' })
  vatAmount: number;

  @Column({ ...money })
  total: number;
}
