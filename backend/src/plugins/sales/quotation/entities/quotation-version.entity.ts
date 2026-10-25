import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { numericColumnTransformer } from '@shared/utils/numeric-column.transformer';

import { DiscountType } from '@plugins/sales/quotation/enums/discount-type.enum';
import { QuotationVersionStatus } from '@plugins/sales/quotation/enums/quotation-version-status.enum';

/** Whole-VND figure the server computes on every change. */
const money = {
  type: 'numeric',
  precision: 18,
  scale: 2,
  default: 0,
  transformer: numericColumnTransformer,
} as const;

/** One numbered version of a quotation; removed only with its quotation. */
@Entity('sales_quotation_versions')
export class QuotationVersion {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'quotation_id' })
  quotationId: number;

  /** 1, 2, 3… unique within the quotation. */
  @Column({ type: 'int' })
  ver: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: QuotationVersionStatus.DRAFT,
  })
  status: QuotationVersionStatus;

  /** The estimate revision the lines were built from. */
  @Column({ type: 'int', name: 'estimate_revision_id' })
  estimateRevisionId: number;

  /** That revision's number, kept for display. */
  @Column({ type: 'int', name: 'estimate_revision' })
  estimateRevision: number;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'discount_type',
    default: DiscountType.PERCENT,
  })
  discountType: DiscountType;

  /** Percent (0–100) or VND, per `discountType`; up to 2 decimals. */
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    name: 'discount_value',
    default: 0,
    transformer: numericColumnTransformer,
  })
  discountValue: number;

  /** VAT rate in percent: 0, 5, 8 or 10. */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    name: 'vat_rate',
    default: 8,
    transformer: numericColumnTransformer,
  })
  vatRate: number;

  /** Σ line amounts, VND. */
  @Column({ ...money })
  subtotal: number;

  @Column({ ...money, name: 'discount_amount' })
  discountAmount: number;

  /** `subtotal − discountAmount`. */
  @Column({ ...money })
  taxable: number;

  @Column({ ...money, name: 'vat_amount' })
  vatAmount: number;

  /** `taxable + vatAmount`. */
  @Column({ ...money })
  total: number;

  /** The terms printed under the table; this version's own copy, editable while it is a draft. */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  terms: string[];

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  /** Who last edited the price or the terms; `null` until someone does. */
  @Column({ type: 'int', name: 'last_edited_by', nullable: true })
  lastEditedBy?: number | null;

  /** Who approved, rejected or cancelled the version, and when. */
  @Column({ type: 'int', name: 'decided_by', nullable: true })
  decidedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'decided_at', nullable: true })
  decidedAt?: Date | null;

  /** The reason of a rejection or a cancellation. */
  @Column({
    type: 'varchar',
    length: 1000,
    name: 'decision_reason',
    nullable: true,
  })
  decisionReason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
