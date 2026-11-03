import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/**
 * One physical cabinet: an order line of quantity n gives n units coded `<tag>-<k>`. Tag and
 * description are copies, so the unit keeps its name whatever happens to the order.
 */
@Entity('production_units')
export class ProductionUnit extends BaseEntity {
  @Column({ type: 'int', name: 'production_order_id' })
  productionOrderId: number;

  @Column({ type: 'int', name: 'order_line_id' })
  orderLineId: number;

  @Column({ type: 'varchar', length: 60 })
  code: string;

  @Column({ type: 'varchar', length: 50 })
  tag: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'int', name: 'assignee_id', nullable: true })
  assigneeId?: number | null;

  @Column({ type: 'date', name: 'planned_end_date', nullable: true })
  plannedEndDate?: string | null;
}
