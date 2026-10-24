import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** One line of a request's timeline, written in the transaction of the change it records. */
@Entity('sales_request_activities')
export class SalesRequestActivity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'int', name: 'request_id' })
  requestId: number;

  /** What happened: `created`, `updated`, `assigned`, `status_changed`, `attachment_added`… */
  @Column({ type: 'varchar', length: 40 })
  action: string;

  @Column({ type: 'int', name: 'actor_id', nullable: true })
  actorId?: number | null;

  @Column({ type: 'varchar', name: 'from_status', length: 20, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', name: 'to_status', length: 20, nullable: true })
  toStatus?: string | null;

  /** The reason of a cancel or loss, the engineer of an assignment, the name of a file. */
  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
