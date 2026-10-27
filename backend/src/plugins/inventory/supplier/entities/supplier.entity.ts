import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

@Entity('suppliers')
export class Supplier extends BaseEntity {
  /** Business code, unique among active rows only (a deleted supplier frees its code). */
  @Column({ type: 'varchar', length: 64 })
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

  @Column({
    type: 'varchar',
    name: 'contact_name',
    length: 255,
    nullable: true,
  })
  contactName?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}
