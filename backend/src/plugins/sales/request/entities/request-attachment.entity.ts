import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** A drawing or spec stored for a request; the bytes live in object storage under `storageKey`. */
@Entity('sales_request_attachments')
export class SalesRequestAttachment {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'request_id' })
  requestId: number;

  @Column({ type: 'varchar', name: 'storage_key', length: 255 })
  storageKey: string;

  /** Sanitised name shown and offered on download; never used to build a path. */
  @Column({ type: 'varchar', name: 'file_name', length: 255 })
  fileName: string;

  /** Derived from the validated extension, never from what the client claimed. */
  @Column({ type: 'varchar', name: 'content_type', length: 100 })
  contentType: string;

  @Column({ type: 'int', name: 'size_bytes' })
  sizeBytes: number;

  @Column({ type: 'int', name: 'uploaded_by', nullable: true })
  uploadedBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
