import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ProductionOrderEventType } from '@plugins/production/production-order/enums/production-order-event.enum';

/** One decision or piece of work recorded in a production order's history. */
@Entity('production_order_events')
export class ProductionOrderEvent {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'production_order_id' })
  productionOrderId: number;

  @Column({
    type: 'enum',
    enum: ProductionOrderEventType,
    enumName: 'production_order_event_type',
  })
  event: ProductionOrderEventType;

  @Column({ type: 'int', name: 'actor_id' })
  actorId: number;

  /** The cabinet an event of a unit is about. */
  @Column({ type: 'varchar', length: 60, name: 'unit_code', nullable: true })
  unitCode?: string | null;

  /** The stage code a stage or issue event is about. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  stage?: string | null;

  /** The severity code of an issue event. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  severity?: string | null;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  /** The assignee a cabinet update event set: the name, or the id as text when none was found. */
  @Column({
    type: 'varchar',
    length: 100,
    name: 'assignee_name',
    nullable: true,
  })
  assigneeName?: string | null;

  /** The planned end date a cabinet update event set, as `YYYY-MM-DD`. */
  @Column({ type: 'date', name: 'planned_end_date', nullable: true })
  plannedEndDate?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
