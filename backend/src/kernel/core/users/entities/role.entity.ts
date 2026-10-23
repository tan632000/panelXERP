import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

@Entity('roles')
export class Role extends BaseEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  @Column({ type: 'jsonb', default: [] })
  permissions: string[];
}
