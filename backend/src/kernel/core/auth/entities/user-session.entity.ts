import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/**
 * One signed-in device of an account. An account may hold several at once — a shared account
 * used on several machines — so each sign-in gets its own row instead of one refresh token per
 * user, and signing in on one device no longer invalidates the others.
 *
 * Only the SHA-256 of the current refresh token is kept; every renewal rotates it.
 */
@Entity('user_sessions')
export class UserSession extends BaseEntity {
  @Index('ix_user_sessions_user_id')
  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @Column({ type: 'varchar', name: 'token_hash', length: 64 })
  tokenHash: string;

  /** Pushed forward on every renewal, so the lifetime runs from the last activity. */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  /** What picks the session to drop when the account goes over its device limit. */
  @Column({ type: 'timestamptz', name: 'last_used_at' })
  lastUsedAt: Date;
}
