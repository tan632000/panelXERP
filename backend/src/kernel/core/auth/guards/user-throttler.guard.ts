import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { ExecutionContext } from '@nestjs/common';

/** Window every request budget is counted over. */
export const THROTTLE_TTL_MS = 60_000;

/**
 * Requests one signed-in user may send to one endpoint per window. A user working a list —
 * filtering, sorting, paging, opening rows — stays well under it; only a runaway client loop
 * reaches it.
 */
export const AUTHENTICATED_THROTTLE_LIMIT = 600;

/** Requests one client IP may send to one public endpoint per window. */
export const ANONYMOUS_THROTTLE_LIMIT = 120;

function userOf(req: Record<string, unknown>): AuthUserPayload | undefined {
  return req.user as AuthUserPayload | undefined;
}

/**
 * The default budget of a request. Login and token refresh keep the stricter limits their
 * own `@Throttle` sets, which override this one.
 */
export function resolveThrottleLimit(context: ExecutionContext): number {
  const req = context.switchToHttp().getRequest<Record<string, unknown>>();
  return userOf(req)?.userId
    ? AUTHENTICATED_THROTTLE_LIMIT
    : ANONYMOUS_THROTTLE_LIMIT;
}

/**
 * Counts the request budget per signed-in user rather than per IP. Every browser in one office
 * leaves through the same address, so an IP bucket makes colleagues exhaust each other's quota.
 * Runs after `JwtAuthGuard`, so `req.user` is set on authenticated routes; public routes (login,
 * refresh) fall back to the client IP.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = userOf(req);
    if (user?.userId) return Promise.resolve(`user:${user.userId}`);
    return Promise.resolve(`ip:${String(req.ip)}`);
  }
}
