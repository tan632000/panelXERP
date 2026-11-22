import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** A file of the acceptance minutes. `storageKey` is server-side only and never serialised. */
@Entity('acceptance_files')
export class AcceptanceFile extends BaseEntity {
  @Column({ type: 'int', name: 'acceptance_id' })
  acceptanceId: number;

  @Column({ type: 'varchar', length: 255, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 50, name: 'content_type' })
  contentType: string;

  @Column({ type: 'varchar', length: 150, name: 'file_name' })
  fileName: string;

  @Column({ type: 'int', name: 'size_bytes' })
  sizeBytes: number;
}
