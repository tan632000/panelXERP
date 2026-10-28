import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

@Entity('locations')
export class Location extends BaseEntity {
  /** Shelf address such as `A-01-02`, unique among active rows (case-insensitive). */
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}
