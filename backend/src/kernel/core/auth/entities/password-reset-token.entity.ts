import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

/**
 * One issued password-reset link. Only the SHA-256 of the token is kept: the plain value
 * lives in the mail and nowhere else, so a leaked table row cannot be replayed as a link.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken extends BaseEntity {
  @Index('ix_password_reset_tokens_user_id')
  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @Column({ type: 'varchar', name: 'token_hash', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  /** Set the moment the link is spent, so a second submit of the same link is refused. */
  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt?: Date | null;
}
