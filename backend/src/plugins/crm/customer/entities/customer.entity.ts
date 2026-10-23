import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

@Entity('customers')
export class Customer extends BaseEntity {
  /** Business code, unique among active rows only (a deleted customer frees its code). */
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', name: 'tax_code', length: 20, nullable: true })
  taxCode?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  /** The sales account that owns the customer; a Sales actor reads only these rows. */
  @Column({ type: 'int', name: 'sales_owner_id' })
  salesOwnerId: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;
}
