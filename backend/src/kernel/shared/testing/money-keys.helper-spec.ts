/**
 * Every key that carries a price or a cost. A response served to an actor without the matching
 * price permission must hold none of them, nested or not. Named `*.helper-spec.ts` so the
 * production build leaves it out and jest does not run it as a test.
 */
export const MONEY_KEYS = [
  'referencePrice',
  'unitPrice',
  'unitCost',
  'avgCost',
  'value',
  'amount',
  'subtotal',
  'discountAmount',
  'vatAmount',
  'total',
  'estimatedCost',
  'actualCost',
  'costVariance',
  'referenceValue',
] as const;

type Json = Record<string, unknown>;

/** Counters of a page envelope: `meta.total` counts rows, it is not a money total. */
const PAGE_COUNTERS = ['total', 'page', 'limit'];

/** The page envelope of a list response. */
function isPageEnvelope(json: Json): boolean {
  const meta = json.meta as Json | null | undefined;
  return (
    Array.isArray(json.data) &&
    typeof meta === 'object' &&
    meta !== null &&
    typeof meta.page === 'number' &&
    typeof meta.limit === 'number'
  );
}

function walk(
  json: unknown,
  allowed: readonly string[],
  path: string,
): string[] {
  if (Array.isArray(json)) {
    return json.flatMap((entry, index) =>
      walk(entry, allowed, `${path}[${index}]`),
    );
  }
  if (json === null || typeof json !== 'object') return [];

  const object = json as Json;
  const paged = isPageEnvelope(object);
  return Object.entries(object).flatMap(([key, value]) => {
    const here = `${path}.${key}`;
    if (paged && key === 'meta') {
      // Only the counters are exempt: any other key under meta is still read.
      const rest = Object.fromEntries(
        Object.entries(value as Json).filter(
          ([name]) => !PAGE_COUNTERS.includes(name),
        ),
      );
      return walk(rest, allowed, here);
    }
    // A key present with `null` still tells the reader that a price exists.
    const offending =
      (MONEY_KEYS as readonly string[]).includes(key) && !allowed.includes(key)
        ? [here]
        : [];
    return [...offending, ...walk(value, allowed, here)];
  });
}

/** Paths (`$.data[0].referencePrice`) of every money key in the JSON tree that is not allowed. */
export function findMoneyKeys(
  json: unknown,
  allowed: readonly string[] = [],
): string[] {
  return walk(json, allowed, '$');
}

/** Fails, naming every offending path, when the whole JSON tree holds a money key not in `allowed`. */
export function expectNoMoneyKeys(
  json: unknown,
  allowed: readonly string[] = [],
): void {
  expect(findMoneyKeys(json, allowed)).toEqual([]);
}
