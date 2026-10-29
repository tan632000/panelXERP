import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A request for goods, raised by hand or from an order's shortage. Its status is derived: what
 * its lines have been ordered comes from the purchase order lines pointing at them (D-11).
 * Never deleted, only cancelled.
 */
@Entity('purchase_requests')
export class PurchaseRequest {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'boolean', name: 'is_cancelled', default: false })
  isCancelled: boolean;

  @Column({ type: 'text', name: 'cancel_reason', nullable: true })
  cancelReason?: string | null;

  @Column({ type: 'int', name: 'cancelled_by', nullable: true })
  cancelledBy?: number | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'int', name: 'updated_by', nullable: true })
  updatedBy?: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
