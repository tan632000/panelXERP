import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** A photo of an installation. `storageKey` is server-side only and never serialised. */
@Entity('installation_photos')
export class InstallationPhoto extends BaseEntity {
  @Column({ type: 'int', name: 'installation_id' })
  installationId: number;

  @Column({ type: 'varchar', length: 255, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 50, name: 'content_type' })
  contentType: string;

  @Column({ type: 'varchar', length: 150, name: 'file_name' })
  fileName: string;

  @Column({ type: 'int', name: 'size_bytes' })
  sizeBytes: number;
}
