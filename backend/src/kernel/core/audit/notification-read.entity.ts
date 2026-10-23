import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Notification } from '@kernel/core/audit/notification.entity';

/**
 * Marks one notification as read by one user. A marker is never soft-deleted, so it
 * carries no audit columns; its absence is the unread state.
 */
@Entity('notification_reads')
export class NotificationRead {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number;

  @Column({ name: 'notification_id', type: 'int' })
  notificationId: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'read_at', type: 'timestamptz', default: () => 'NOW()' })
  readAt: Date;

  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification?: Notification;
}
