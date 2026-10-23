import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

import { Customer } from '@plugins/crm/customer/entities/customer.entity';

@Entity('contacts')
export class Contact extends BaseEntity {
  @Column({ type: 'int', name: 'customer_id' })
  customerId: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  position?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  /** At most one active contact per customer is primary. */
  @Column({ type: 'boolean', name: 'is_primary', default: false })
  isPrimary: boolean;

  /** Joined for scope checks and the list; visibility follows `customer.salesOwnerId`. */
  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;
}
