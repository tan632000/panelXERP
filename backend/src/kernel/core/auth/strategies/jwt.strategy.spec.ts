import { UnauthorizedException } from '@nestjs/common';

import { AuthPrincipalCache } from '@kernel/core/auth/auth-principal-cache.service';
import { JwtStrategy } from '@kernel/core/auth/strategies/jwt.strategy';

import type { AuthService } from '@kernel/core/auth/auth.service';
import type { ConfigService } from '@nestjs/config';

function build(sessionLive: boolean) {
  const authService = {
    isSessionLive: jest.fn().mockResolvedValue(sessionLive),
    getProfile: jest.fn().mockResolvedValue({
      user: {
        id: 7,
        username: 'keeper',
        email: 'k@example.com',
        role: 'warehouse_keeper',
      },
      permissions: ['mrp:read'],
    }),
  };
  const config = { get: jest.fn().mockReturnValue('secret') };
  const cache = new AuthPrincipalCache();
  const strategy = new JwtStrategy(
    config as unknown as ConfigService,
    authService as unknown as AuthService,
    cache,
  );
  return { strategy, authService, cache };
}

describe('JwtStrategy.validate', () => {
  it('refuses a token whose device has signed out', async () => {
    const { strategy, authService } = build(false);

    await expect(strategy.validate({ sub: 7, sid: 41 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.isSessionLive).toHaveBeenCalledWith(7, 41);
    expect(authService.getProfile).not.toHaveBeenCalled();
  });

  it('accepts a token whose device is still signed in', async () => {
    const { strategy } = build(true);

    await expect(strategy.validate({ sub: 7, sid: 41 })).resolves.toMatchObject(
      {
        userId: 7,
        sessionId: 41,
      },
    );
  });

  it('accepts a token issued before sessions existed without a session lookup', async () => {
    const { strategy, authService } = build(false);

    await expect(strategy.validate({ sub: 7 })).resolves.toMatchObject({
      userId: 7,
    });
    expect(authService.isSessionLive).not.toHaveBeenCalled();
  });

  it('serves a repeat request of the same device from the cache', async () => {
    const { strategy, authService } = build(true);

    await strategy.validate({ sub: 7, sid: 41 });
    await expect(strategy.validate({ sub: 7, sid: 41 })).resolves.toMatchObject(
      { userId: 7, permissions: ['mrp:read'] },
    );
    expect(authService.isSessionLive).toHaveBeenCalledTimes(1);
    expect(authService.getProfile).toHaveBeenCalledTimes(1);
  });

  it('rechecks the database once the account is evicted', async () => {
    const { strategy, authService, cache } = build(true);

    await strategy.validate({ sub: 7, sid: 41 });
    cache.invalidateUser(7);
    authService.isSessionLive.mockResolvedValue(false);

    await expect(strategy.validate({ sub: 7, sid: 41 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('keeps devices apart, so a signed-out device is not served from another', async () => {
    const { strategy, authService } = build(true);

    await strategy.validate({ sub: 7, sid: 41 });
    await strategy.validate({ sub: 7, sid: 42 });

    expect(authService.isSessionLive).toHaveBeenCalledTimes(2);
  });
});
