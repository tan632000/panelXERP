import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';

/** A photo of one stage of a cabinet. `storageKey` is server-side only and never serialised. */
@Entity('production_unit_photos')
export class UnitPhoto {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'unit_id' })
  unitId: number;

  @Column({
    type: 'enum',
    enum: ProductionStage,
    enumName: 'production_stage',
  })
  stage: ProductionStage;

  @Column({ type: 'int', name: 'issue_id', nullable: true })
  issueId?: number | null;

  @Column({ type: 'varchar', length: 255, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 150, name: 'file_name' })
  fileName: string;

  @Column({ type: 'varchar', length: 50, name: 'content_type' })
  contentType: string;

  @Column({ type: 'int', name: 'size_bytes' })
  sizeBytes: number;

  @Column({ type: 'int', name: 'uploaded_by', nullable: true })
  uploadedBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
