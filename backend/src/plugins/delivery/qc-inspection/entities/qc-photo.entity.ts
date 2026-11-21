import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** A photo of one round item. `storageKey` is server-side only and never serialised. */
@Entity('qc_photos')
export class QcPhoto extends BaseEntity {
  @Column({ type: 'int', name: 'round_item_id' })
  roundItemId: number;

  @Column({ type: 'varchar', length: 255, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 50, name: 'content_type' })
  contentType: string;

  @Column({ type: 'varchar', length: 150, name: 'file_name' })
  fileName: string;

  @Column({ type: 'int', name: 'size_bytes' })
  sizeBytes: number;
}
