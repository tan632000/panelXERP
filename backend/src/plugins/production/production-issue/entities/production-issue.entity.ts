import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

import {
  ProductionIssueSeverity,
  ProductionIssueStatus,
} from '@plugins/production/production-issue/enums/production-issue.enum';
import { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';

/** A problem reported on one stage of a cabinet; open until a production manager resolves it. */
@Entity('production_issues')
export class ProductionIssue extends BaseEntity {
  @Column({ type: 'int', name: 'unit_id' })
  unitId: number;

  @Column({
    type: 'enum',
    enum: ProductionStage,
    enumName: 'production_stage',
  })
  stage: ProductionStage;

  @Column({ type: 'varchar', length: 2000 })
  description: string;

  @Column({
    type: 'enum',
    enum: ProductionIssueSeverity,
    enumName: 'production_issue_severity',
  })
  severity: ProductionIssueSeverity;

  @Column({
    type: 'enum',
    enum: ProductionIssueStatus,
    enumName: 'production_issue_status',
    default: ProductionIssueStatus.OPEN,
  })
  status: ProductionIssueStatus;

  @Column({ type: 'int', name: 'reported_by' })
  reportedBy: number;

  @Column({ type: 'int', name: 'resolved_by', nullable: true })
  resolvedBy?: number | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  resolution?: string | null;
}
