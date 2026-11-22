import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

import { DeliveryNoteStatus } from '@plugins/delivery/delivery-note/constants/delivery-note.constant';

/**
 * One shipment of finished cabinets of one order. The code is a document number, unique over
 * every row. `order_id` carries no foreign key, as production's: the order is locked by its own
 * writers through the sales port. Never deleted, only cancelled.
 */
@Entity('delivery_notes')
export class DeliveryNote extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'order_id' })
  orderId: number;

  @Column({ type: 'varchar', length: 10, default: DeliveryNoteStatus.DRAFT })
  status: DeliveryNoteStatus;

  @Column({ type: 'date', name: 'planned_date', nullable: true })
  plannedDate?: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'delivery_address',
    nullable: true,
  })
  deliveryAddress?: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note?: string | null;

  @Column({ type: 'timestamptz', name: 'shipped_at', nullable: true })
  shippedAt?: Date | null;

  @Column({ type: 'int', name: 'shipped_by', nullable: true })
  shippedBy?: number | null;

  @Column({ type: 'date', name: 'received_date', nullable: true })
  receivedDate?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'receiver_name',
    nullable: true,
  })
  receiverName?: string | null;

  @Column({ type: 'int', name: 'received_by', nullable: true })
  receivedBy?: number | null;

  @Column({
    type: 'varchar',
    length: 1000,
    name: 'cancel_reason',
    nullable: true,
  })
  cancelReason?: string | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'int', name: 'cancelled_by', nullable: true })
  cancelledBy?: number | null;
}
