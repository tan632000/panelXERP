import { resolveSecret } from '@kernel/core/config/app.config';

const STRONG_SECRET = 'x'.repeat(32);

describe('resolveSecret', () => {
  it('falls back to the dev value outside production', () => {
    expect(
      resolveSecret('JWT_SECRET', 'dev', { NODE_ENV: 'development' }),
    ).toBe('dev');
    expect(
      resolveSecret('JWT_SECRET', 'dev', {
        NODE_ENV: 'development',
        JWT_SECRET: 'short-dev-value',
      }),
    ).toBe('short-dev-value');
  });

  it('requires the secret in production', () => {
    expect(() =>
      resolveSecret('JWT_SECRET', 'dev', { NODE_ENV: 'production' }),
    ).toThrow('JWT_SECRET must be set in production.');
  });

  it('refuses the CHANGE_ME placeholder in production', () => {
    expect(() =>
      resolveSecret('JWT_SECRET', 'dev', {
        NODE_ENV: 'production',
        JWT_SECRET: 'CHANGE_ME',
      }),
    ).toThrow('must be a real secret');
    expect(() =>
      resolveSecret('JWT_REFRESH_SECRET', 'dev', {
        NODE_ENV: 'production',
        JWT_REFRESH_SECRET: `CHANGE_ME${'x'.repeat(40)}`,
      }),
    ).toThrow('must be a real secret');
  });

  it('refuses the dev values published in the env examples in production', () => {
    for (const published of [
      'dev-secret-key-change-in-production',
      'dev-refresh-secret-change-in-production',
    ]) {
      expect(() =>
        resolveSecret('JWT_SECRET', 'dev', {
          NODE_ENV: 'production',
          JWT_SECRET: published,
        }),
      ).toThrow('must be a real secret');
    }
  });

  it('refuses a secret shorter than 32 characters in production', () => {
    expect(() =>
      resolveSecret('JWT_SECRET', 'dev', {
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(31),
      }),
    ).toThrow('at least 32 characters');
  });

  it('accepts a long real secret in production', () => {
    expect(
      resolveSecret('JWT_SECRET', 'dev', {
        NODE_ENV: 'production',
        JWT_SECRET: STRONG_SECRET,
      }),
    ).toBe(STRONG_SECRET);
  });
});
