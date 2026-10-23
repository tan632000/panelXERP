/**
 * Where a detail screen was opened from, so its breadcrumb can lead back there.
 *
 * A detail page normally returns to its own list. When it was reached from another record —
 * a purchase order opened from the plan or the request it was raised from — the reader has to
 * land back on that record, not on the order list they never visited.
 *
 * The origin travels in the URL rather than in memory, so a reload or a shared link keeps the
 * way back. The *origin* screen supplies the label already translated: it owns that wording in
 * its own i18n namespace, and a plugin may not read another plugin's bundle.
 */
export interface DetailOrigin {
  /** Path back to the originating record. */
  href: string;
  /** What the breadcrumb reads, already localized by the screen that linked here. */
  label: string;
  /** Optional breadcrumb icon name. */
  icon?: string;
}

/** Query parameter the origin rides in. */
export const DETAIL_ORIGIN_PARAM = "origin";

/** Guards against a hand-edited URL sending the reader off-site. */
function isSafeInternalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/** Encodes an origin for the query string. Returns undefined when there is nothing to carry. */
export function encodeDetailOrigin(
  origin: DetailOrigin | null | undefined,
): string | undefined {
  if (!origin?.href || !origin.label) return undefined;
  if (!isSafeInternalPath(origin.href)) return undefined;
  return encodeURIComponent(
    JSON.stringify({
      href: origin.href,
      label: origin.label,
      ...(origin.icon ? { icon: origin.icon } : {}),
    }),
  );
}

/**
 * Reads an origin back out of a query value.
 *
 * Anything malformed, foreign or incomplete decodes to null and the caller falls back to its
 * own list crumb — a broken `origin` must never strand the reader or send them elsewhere.
 */
export function decodeDetailOrigin(
  value: string | null | undefined,
): DetailOrigin | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { href, label, icon } = parsed as Record<string, unknown>;
    if (typeof href !== "string" || typeof label !== "string") return null;
    if (!href || !label || !isSafeInternalPath(href)) return null;
    return {
      href,
      label,
      ...(typeof icon === "string" && icon ? { icon } : {}),
    };
  } catch {
    return null;
  }
}

/** Appends an origin to a detail path, leaving the path untouched when there is none. */
export function withDetailOrigin(
  href: string,
  origin: DetailOrigin | null | undefined,
): string {
  const encoded = encodeDetailOrigin(origin);
  return encoded ? `${href}?${DETAIL_ORIGIN_PARAM}=${encoded}` : href;
}
