/**
 * The last page the reader was on, so the page they land on can tell where they came from.
 *
 * The router exposes no such history, and `document.referrer` stays on the entry URL across
 * client-side navigation.
 */

let lastVisitedPathname: string | null = null;

/** Records the page now being shown. Repeating the current path is not a new visit. */
export function recordVisitedPathname(pathname: string): void {
  if (pathname === lastVisitedPathname) return;
  lastVisitedPathname = pathname;
}

/**
 * The page shown before the one now mounting, locale prefix stripped. Null on the first page
 * of the session.
 */
export function getLastVisitedPathname(): string | null {
  return lastVisitedPathname;
}
