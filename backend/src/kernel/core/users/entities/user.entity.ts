import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@shared/entities/base.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', name: 'full_name', length: 100 })
  fullName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', name: 'avatar_url', length: 500, nullable: true })
  avatarUrl?: string | null;

  /** Storage key of the account's transparent signature PNG, stamped onto printed documents. */
  @Column({
    type: 'varchar',
    name: 'signature_url',
    length: 500,
    nullable: true,
  })
  signatureUrl?: string | null;

  /**
   * Storage key of a signature a non-administrator submitted, waiting for an administrator.
   * It replaces `signatureUrl` only once approved.
   */
  @Column({
    type: 'varchar',
    name: 'pending_signature_url',
    length: 500,
    nullable: true,
  })
  pendingSignatureUrl?: string | null;

  @Column({
    name: 'signature_requested_at',
    type: 'timestamptz',
    nullable: true,
  })
  signatureRequestedAt?: Date | null;

  /** Why the last submitted signature was rejected; cleared by the next submission. */
  @Column({
    type: 'varchar',
    name: 'signature_rejection_reason',
    length: 500,
    nullable: true,
  })
  signatureRejectionReason?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt?: Date | null;

  @Column({
    type: 'varchar',
    name: 'refresh_token',
    length: 500,
    nullable: true,
  })
  refreshToken?: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;
}
