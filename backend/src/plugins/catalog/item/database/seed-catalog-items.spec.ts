import { CATALOG_SEED_ITEMS } from '@plugins/catalog/item/database/seed-catalog-items';
import { ITEM_GROUPS } from '@plugins/catalog/item/enums/item-group.enum';

describe('catalog item seed data', () => {
  it('has no two codes that differ only by casing, since the live-code index is case-insensitive', () => {
    const codes = CATALOG_SEED_ITEMS.map(([code]) => code.toLowerCase());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('uses a known item group and a code that fits the 64-character column', () => {
    for (const [code, name, , group] of CATALOG_SEED_ITEMS) {
      expect(ITEM_GROUPS).toContain(group);
      expect(code.length).toBeLessThanOrEqual(64);
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
