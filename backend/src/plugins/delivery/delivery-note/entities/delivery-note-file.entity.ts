import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** A handover document of a received note. `storageKey` is server-side only. */
@Entity('delivery_note_files')
export class DeliveryNoteFile extends BaseEntity {
  @Column({ type: 'int', name: 'note_id' })
  noteId: number;

  @Column({ type: 'varchar', length: 255, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 50, name: 'content_type' })
  contentType: string;

  @Column({ type: 'varchar', length: 150, name: 'file_name' })
  fileName: string;

  @Column({ type: 'int', name: 'size_bytes' })
  sizeBytes: number;
}
