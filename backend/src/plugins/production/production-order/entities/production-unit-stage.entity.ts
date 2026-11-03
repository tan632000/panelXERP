import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import {
  ProductionStage,
  ProductionStageStatus,
} from '@plugins/production/production-order/enums/production-stage.enum';

/** One of a unit's six stages; all six exist from the moment the unit does. */
@Entity('production_unit_stages')
export class ProductionUnitStage {
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

  /** Position in the sequence, 1 to 6. */
  @Column({ type: 'smallint' })
  seq: number;

  @Column({
    type: 'enum',
    enum: ProductionStageStatus,
    enumName: 'production_stage_status',
    default: ProductionStageStatus.PENDING,
  })
  status: ProductionStageStatus;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'int', name: 'started_by', nullable: true })
  startedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'done_at', nullable: true })
  doneAt?: Date | null;

  @Column({ type: 'int', name: 'done_by', nullable: true })
  doneBy?: number | null;
}
