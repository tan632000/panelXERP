/**
 * Wraps a read-only async lookup so equal arguments reach the database once per wrapper.
 *
 * Meant for one validation pass over a document's lines, where many lines name the same order,
 * supplier or lot: build the wrapper at the top of the pass and drop it afterwards — never keep
 * it on a service, since a cached answer goes stale as soon as the data changes. A rejection is
 * cached too, so a caller that aborts on the first error behaves exactly as it did uncached.
 */
export function memoizeAsync<TArgs extends unknown[], TResult>(
  read: (...args: TArgs) => Promise<TResult>,
  keyOf: (...args: TArgs) => string = (...args) => JSON.stringify(args),
): (...args: TArgs) => Promise<TResult> {
  const cache = new Map<string, Promise<TResult>>();
  return (...args: TArgs) => {
    const key = keyOf(...args);
    let pending = cache.get(key);
    if (!pending) {
      pending = read(...args);
      cache.set(key, pending);
    }
    return pending;
  };
}
