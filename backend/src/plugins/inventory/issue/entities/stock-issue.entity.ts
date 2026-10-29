import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Materials issued to one sales order. Immutable and never deleted, so it carries no
 * soft-delete columns; what the workshop did not use comes back as a workshop return.
 */
@Entity('stock_issues')
export class StockIssue {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  /** The sales order; no foreign key (see the migration). */
  @Column({ type: 'int', name: 'order_id' })
  orderId: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** The client's key for this post: a repeat returns this issue instead of posting again. */
  @Column({ type: 'uuid', name: 'request_key', nullable: true })
  requestKey?: string | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
