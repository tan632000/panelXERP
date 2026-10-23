import { MoreThan, Not, type Repository } from 'typeorm';

import type { UserSession } from '@kernel/core/auth/entities/user-session.entity';

/**
 * Devices one account may be signed in on at once. Signing in on one more drops the session
 * used least recently rather than refusing the sign-in: a device someone forgot to sign out
 * of must not lock the account out.
 */
export const MAX_SESSIONS_PER_USER = 10;

/** Refresh-token lifetime, matching the `expiresIn` the refresh token is signed with. */
export const REFRESH_TOKEN_TTL = '7d';
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + REFRESH_TOKEN_TTL_MS);
}

/** Where-clause of the sessions that can still be renewed. */
export function liveSessionsOf(userId: number) {
  return {
    userId,
    isDeleted: false,
    expiresAt: MoreThan(new Date()),
  };
}

/**
 * Revokes every session of an account — deactivation, deletion, a password reset — or every
 * one but the caller's own, for a password change made from that device.
 */
export async function revokeUserSessions(
  sessionRepo: Repository<UserSession>,
  userId: number,
  options: { exceptSessionId?: number; actorId?: number | null } = {},
): Promise<void> {
  await sessionRepo.update(
    {
      userId,
      isDeleted: false,
      ...(options.exceptSessionId !== undefined && {
        id: Not(options.exceptSessionId),
      }),
    },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: options.actorId ?? null,
    },
  );
}
