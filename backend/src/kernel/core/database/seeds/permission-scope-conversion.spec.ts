import { matchesPermission } from '@kernel/core/auth/utils/permission-match.util';
import { holds } from '@kernel/core/database/seeds/permission-scope-conversion';

describe('holds', () => {
  const set = (...scopes: string[]) => new Set(scopes);

  it('matches like the roles guard', () => {
    expect(holds(set('a:read'), 'a:read')).toBe(true);
    expect(holds(set('a:*'), 'a:write')).toBe(true);
    expect(holds(set('*:*'), 'a:write')).toBe(true);
    expect(holds(set('*:read'), 'a:read')).toBe(true);
    expect(holds(set('*:read'), 'a:price:read')).toBe(false);
    expect(holds(set('*:price'), 'a:price:read')).toBe(true);
    expect(holds(set('*:read'), 'a:write')).toBe(false);
    expect(holds(set('b:read'), 'a:read')).toBe(false);
  });

  it('agrees with matchesPermission on a spread of scopes', () => {
    const held = [
      'a:*',
      '*:read',
      'b:write:general',
      'c:price:read',
      '*:export',
    ];
    for (const scope of [
      'a:x',
      'b:read',
      'b:write:general',
      'c:price:read',
      'c:export',
      'd:read',
      'd:write',
      'e:price:read',
    ]) {
      expect(holds(new Set(held), scope)).toBe(matchesPermission(held, scope));
    }
  });
});
