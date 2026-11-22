import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

import { REPRESENTATIVE_NAME_MAX } from '@plugins/delivery/acceptance/constants/acceptance.constant';

/**
 * The signed acceptance minutes of an order: at most one per order. `order_id` carries no
 * foreign key, as the delivery notes': the order is locked by its own writers through the sales
 * port. Never deleted, never cancelled.
 */
@Entity('acceptances')
export class Acceptance extends BaseEntity {
  @Column({ type: 'int', name: 'order_id' })
  orderId: number;

  @Column({
    type: 'varchar',
    length: REPRESENTATIVE_NAME_MAX,
    name: 'representative_name',
  })
  representativeName: string;

  @Column({ type: 'date', name: 'signed_date' })
  signedDate: string;
}
