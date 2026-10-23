import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/** Lifecycle of a notification. Stored English; every display language is a label. */
export enum NotificationStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}

/**
 * One in-app notification record, addressed either to a set of role codes — so a user who
 * joins a role afterwards still sees an open item — or, when `user_ids` is filled, to those
 * named users alone.
 *
 * `status` is shared across every recipient and changes only when the underlying work
 * completes. Per-recipient read state lives in `notification_reads`.
 */
@Entity('notifications')
export class Notification extends BaseEntity {
  @Column({ type: 'varchar', name: 'event_type', length: 64 })
  eventType: string;

  /**
   * Caller-supplied identity of the subject the notification is about, unique per event
   * type among open records. Closure matches on it instead of scanning payloads.
   */
  @Column({
    type: 'varchar',
    name: 'dedupe_key',
    length: 128,
    nullable: true,
  })
  dedupeKey?: string | null;

  @Column({ type: 'jsonb', name: 'role_codes', default: [] })
  roleCodes: string[];

  /**
   * Named recipients. When non-empty the record is addressed to exactly these users and the
   * role set no longer grants access — an order notification reaches the one person who
   * created it, not everyone sharing their role. Empty means role addressing, the default.
   */
  @Column({ type: 'jsonb', name: 'user_ids', default: [] })
  userIds: number[];

  /**
   * Users this record withholds itself from even when their role is addressed — the actor
   * whose own action raised it, who already saw the result on screen.
   */
  @Column({ type: 'jsonb', name: 'exclude_user_ids', default: [] })
  excludeUserIds: number[];

  /** Permission an actor must also hold before this record is readable. */
  @Column({
    type: 'varchar',
    name: 'required_scope',
    length: 64,
    nullable: true,
  })
  requiredScope?: string | null;

  /**
   * Optional denormalised text. Clients render from `event_type` and `payload` through
   * their message bundle, so no display language is stored here.
   */
  @Column({ type: 'text', nullable: true })
  message?: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  link?: string | null;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 32,
    default: NotificationStatus.OPEN,
  })
  status: NotificationStatus;
}
