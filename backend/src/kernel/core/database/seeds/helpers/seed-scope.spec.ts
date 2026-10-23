import { parseSeedScope } from '@kernel/core/database/seeds/helpers/seed-scope';

describe('parseSeedScope', () => {
  describe('SEED_SCOPE override', () => {
    it('honours core even on a local env', () => {
      expect(parseSeedScope('core', 'development')).toBe('core');
    });

    it('honours all even on production', () => {
      expect(parseSeedScope('all', 'production')).toBe('all');
    });

    it('ignores casing and surrounding whitespace', () => {
      expect(parseSeedScope('  ALL  ', 'production')).toBe('all');
    });

    it('rejects an unknown value', () => {
      expect(() => parseSeedScope('partial', 'development')).toThrow(
        /Invalid SEED_SCOPE "partial"/,
      );
    });

    it('falls back to NODE_ENV when blank', () => {
      expect(parseSeedScope('   ', 'development')).toBe('all');
    });
  });

  describe('NODE_ENV fallback', () => {
    it.each(['development', 'test', 'local', 'DEVELOPMENT'])(
      'seeds everything on %s',
      (nodeEnv) => {
        expect(parseSeedScope(undefined, nodeEnv)).toBe('all');
      },
    );

    it.each(['production', 'staging', 'prd', 'preprod'])(
      'seeds core only on %s',
      (nodeEnv) => {
        expect(parseSeedScope(undefined, nodeEnv)).toBe('core');
      },
    );

    it('seeds core only when NODE_ENV is unset', () => {
      expect(parseSeedScope(undefined, undefined)).toBe('core');
    });
  });
});
