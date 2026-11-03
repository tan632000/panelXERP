import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';

/**
 * The workshop's order to build one sales order. The code is a document number, unique over
 * every row. `order_id` carries no foreign key: the sales order is locked by its own writers
 * through the sales port, and a key share from here would stand in the global lock order.
 * Never deleted, only cancelled. Every write locks this row `FOR UPDATE` and moves the status
 * with `UPDATE … WHERE status = :expected`.
 */
@Entity('production_orders')
export class ProductionOrder extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'order_id' })
  orderId: number;

  /** The sales order's code when the production order was made. */
  @Column({ type: 'varchar', length: 30, name: 'order_code' })
  orderCode: string;

  @Column({
    type: 'enum',
    enum: ProductionOrderStatus,
    enumName: 'production_order_status',
    default: ProductionOrderStatus.DRAFT,
  })
  status: ProductionOrderStatus;

  @Column({ type: 'timestamptz', name: 'released_at', nullable: true })
  releasedAt?: Date | null;

  @Column({ type: 'int', name: 'released_by', nullable: true })
  releasedBy?: number | null;

  @Column({ type: 'text', name: 'cancel_reason', nullable: true })
  cancelReason?: string | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'int', name: 'cancelled_by', nullable: true })
  cancelledBy?: number | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt?: Date | null;
}
