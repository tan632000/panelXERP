import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Goods sent back to the supplier of one purchase order. Immutable and never deleted. */
@Entity('stock_supplier_returns')
export class StockSupplierReturn {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'purchase_order_id' })
  purchaseOrderId: number;

  /** Why the goods go back (damaged, wrong item…); required. */
  @Column({ type: 'text' })
  reason: string;

  /** The client's key for this post: a repeat returns this document instead of posting again. */
  @Column({ type: 'uuid', name: 'request_key', nullable: true })
  requestKey?: string | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
