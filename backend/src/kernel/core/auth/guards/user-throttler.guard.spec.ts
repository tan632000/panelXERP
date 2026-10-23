import {
  ANONYMOUS_THROTTLE_LIMIT,
  AUTHENTICATED_THROTTLE_LIMIT,
  resolveThrottleLimit,
  UserThrottlerGuard,
} from './user-throttler.guard';

import type { ExecutionContext } from '@nestjs/common';

interface TrackerAccess {
  getTracker(req: Record<string, unknown>): Promise<string>;
}

// The tracker reads only the request, so the guard's injected storage and options are not needed.
const guard = Object.create(
  UserThrottlerGuard.prototype,
) as unknown as TrackerAccess;

describe('UserThrottlerGuard', () => {
  it('gives each signed-in user their own bucket, whatever IP they share', async () => {
    const officeIp = '203.0.113.7';

    await expect(
      guard.getTracker({ ip: officeIp, user: { userId: 12 } }),
    ).resolves.toBe('user:12');
    await expect(
      guard.getTracker({ ip: officeIp, user: { userId: 13 } }),
    ).resolves.toBe('user:13');
  });

  it('falls back to the client IP on a public route', async () => {
    await expect(guard.getTracker({ ip: '203.0.113.7' })).resolves.toBe(
      'ip:203.0.113.7',
    );
  });

  it('gives a signed-in user the larger budget and a public caller the smaller one', () => {
    const contextFor = (req: Record<string, unknown>) =>
      ({
        switchToHttp: () => ({ getRequest: () => req }),
      }) as unknown as ExecutionContext;

    expect(resolveThrottleLimit(contextFor({ user: { userId: 12 } }))).toBe(
      AUTHENTICATED_THROTTLE_LIMIT,
    );
    expect(resolveThrottleLimit(contextFor({ ip: '203.0.113.7' }))).toBe(
      ANONYMOUS_THROTTLE_LIMIT,
    );
  });
});
