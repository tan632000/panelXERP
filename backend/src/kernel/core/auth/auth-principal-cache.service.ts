import { Injectable } from '@nestjs/common';

/** What the JWT strategy attaches to `req.user` for one signed-in device. */
export interface AuthPrincipal {
  userId: number;
  username: string;
  email: string;
  role: string;
  permissions: string[];
  sessionId?: number;
}

/**
 * Safety net only: every change made through the app — deactivation, deletion, a role or
 * permission edit, sign-out, a password change — evicts the affected entries at once. The TTL
 * bounds what a direct database edit (a seed, a manual fix) can leave stale.
 */
export const AUTH_PRINCIPAL_TTL_MS = 30_000;

/** Above this many entries a write first sweeps the expired ones, so the map cannot grow unbounded. */
const SWEEP_THRESHOLD = 1_000;

/**
 * Per-device cache of the principal the JWT strategy resolves, sparing the session, account
 * and role queries it would otherwise run on every request.
 *
 * Held in process memory: production runs a single backend process, so an eviction here is
 * seen by every later request. Running several instances would need a shared store instead.
 */
@Injectable()
export class AuthPrincipalCache {
  private readonly entries = new Map<
    string,
    { principal: AuthPrincipal; expiresAt: number }
  >();

  get(userId: number, sessionId?: number): AuthPrincipal | undefined {
    const key = this.keyOf(userId, sessionId);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.principal;
  }

  set(userId: number, sessionId: number | undefined, principal: AuthPrincipal) {
    if (this.entries.size >= SWEEP_THRESHOLD) this.sweepExpired();
    this.entries.set(this.keyOf(userId, sessionId), {
      principal,
      expiresAt: Date.now() + AUTH_PRINCIPAL_TTL_MS,
    });
  }

  /** Drops every device of one account, after a change to that account or its sessions. */
  invalidateUser(userId: number): void {
    const prefix = `${userId}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  /** Drops everything, after a role's permissions change — any number of accounts hold it. */
  clear(): void {
    this.entries.clear();
  }

  private keyOf(userId: number, sessionId?: number): string {
    return `${userId}:${sessionId ?? '-'}`;
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
