import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

import {
  INSTALLATION_NOTE_MAX,
  InstallationStatus,
  PERSON_IN_CHARGE_MAX,
  SITE_ADDRESS_MAX,
} from '@plugins/delivery/installation/constants/installation.constant';

/**
 * The installation of an order's cabinets at the project: at most one per order. `order_id`
 * carries no foreign key, as the delivery notes': the order is locked by its own writers
 * through the sales port. Never deleted, never cancelled.
 */
@Entity('installations')
export class Installation extends BaseEntity {
  @Column({ type: 'int', name: 'order_id' })
  orderId: number;

  @Column({
    type: 'varchar',
    length: SITE_ADDRESS_MAX,
    name: 'site_address',
    nullable: true,
  })
  siteAddress?: string | null;

  @Column({ type: 'date', name: 'planned_date', nullable: true })
  plannedDate?: string | null;

  @Column({
    type: 'varchar',
    length: PERSON_IN_CHARGE_MAX,
    name: 'person_in_charge',
    nullable: true,
  })
  personInCharge?: string | null;

  @Column({ type: 'varchar', length: INSTALLATION_NOTE_MAX, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 12, default: InstallationStatus.PLANNED })
  status: InstallationStatus;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'int', name: 'started_by', nullable: true })
  startedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'done_at', nullable: true })
  doneAt?: Date | null;

  @Column({ type: 'int', name: 'done_by', nullable: true })
  doneBy?: number | null;
}
