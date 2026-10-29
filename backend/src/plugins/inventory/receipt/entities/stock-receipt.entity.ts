import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Goods received against one purchase order. Immutable and never deleted, so it carries no
 * soft-delete columns; a correction is a supplier return or a count.
 */
@Entity('stock_receipts')
export class StockReceipt {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'purchase_order_id' })
  purchaseOrderId: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** The client's key for this post: a repeat returns this receipt instead of posting again. */
  @Column({ type: 'uuid', name: 'request_key', nullable: true })
  requestKey?: string | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
