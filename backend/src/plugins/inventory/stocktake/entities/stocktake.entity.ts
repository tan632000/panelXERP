import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  StocktakeScope,
  StocktakeStatus,
} from '@plugins/inventory/stocktake/enums/stocktake.enum';

/**
 * One count of the whole warehouse or of one location. The header is the row every decision
 * locks (`FOR UPDATE`) and moves with `UPDATE … WHERE status = :expected`. Never deleted.
 */
@Entity('stocktakes')
export class Stocktake {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'enum', enum: StocktakeScope, enumName: 'stocktake_scope' })
  scope: StocktakeScope;

  @Column({ type: 'int', name: 'location_id', nullable: true })
  locationId?: number | null;

  @Column({
    type: 'enum',
    enum: StocktakeStatus,
    enumName: 'stocktake_status',
    default: StocktakeStatus.COUNTING,
  })
  status: StocktakeStatus;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'int', name: 'submitted_by', nullable: true })
  submittedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submittedAt?: Date | null;

  /** Everyone who ever submitted the count: none of them may approve it. */
  @Column({
    type: 'int',
    array: true,
    name: 'submitter_ids',
    default: () => "'{}'",
  })
  submitterIds: number[];

  @Column({ type: 'int', name: 'approved_by', nullable: true })
  approvedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt?: Date | null;

  @Column({ type: 'text', name: 'reject_reason', nullable: true })
  rejectReason?: string | null;

  @Column({ type: 'text', name: 'cancel_reason', nullable: true })
  cancelReason?: string | null;

  @Column({ type: 'int', name: 'cancelled_by', nullable: true })
  cancelledBy?: number | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt?: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
