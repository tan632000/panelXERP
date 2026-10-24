import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

import { Customer } from '@plugins/crm/customer/entities/customer.entity';

@Entity('projects')
export class Project extends BaseEntity {
  /** Business code, unique among active rows only (a deleted project frees its code). */
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'int', name: 'customer_id' })
  customerId: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'varchar',
    name: 'site_address',
    length: 500,
    nullable: true,
  })
  siteAddress?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** Joined for scope checks and the list; visibility follows `customer.salesOwnerId`. */
  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;
}
