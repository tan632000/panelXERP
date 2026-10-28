import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { PurchaseOrderEventType } from '@plugins/inventory/purchase-order/enums/purchase-order-event.enum';

/** One decision in an order's life: who submitted, approved, rejected, cancelled or closed it. */
@Entity('purchase_order_events')
export class PurchaseOrderEvent {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'purchase_order_id' })
  purchaseOrderId: number;

  @Column({
    type: 'enum',
    enum: PurchaseOrderEventType,
    enumName: 'purchase_order_event_type',
  })
  event: PurchaseOrderEventType;

  @Column({ type: 'int', name: 'actor_id' })
  actorId: number;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
