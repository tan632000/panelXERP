import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Leftovers the workshop brought back from one sales order. Immutable and never deleted. */
@Entity('stock_workshop_returns')
export class StockWorkshopReturn {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  /** The sales order; no foreign key (see the migration). */
  @Column({ type: 'int', name: 'order_id' })
  orderId: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** The client's key for this post: a repeat returns this document instead of posting again. */
  @Column({ type: 'uuid', name: 'request_key', nullable: true })
  requestKey?: string | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
