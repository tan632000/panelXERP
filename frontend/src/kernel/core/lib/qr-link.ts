import { routing } from "@kernel/i18n/routing";

const ABSOLUTE_URL = /^https?:\/\//i;

/**
 * The in-app path a scanned QR links to, or `null` when the QR is not a link into this app.
 *
 * A printed QR carries the absolute URL of the screen that printed it (`receipt-line-qr.ts`);
 * only a URL on `origin`, or a bare `/path`, is followed, so a foreign link or a plain-text
 * payload (`TEM-2026-0001|TP_0011|…`) never moves the app. A locale prefix is dropped because
 * the router adds the reader's own.
 */
export function resolveInAppQrPath(
  text: string,
  origin: string,
): string | null {
  const raw = text.trim();
  const isPath = raw.startsWith("/") && !raw.startsWith("//");
  if (!isPath && !ABSOLUTE_URL.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, origin);
    if (url.origin !== new URL(origin).origin) return null;
  } catch {
    return null;
  }

  const [, first, ...rest] = url.pathname.split("/");
  const pathname = (routing.locales as readonly string[]).includes(first)
    ? `/${rest.join("/")}`
    : url.pathname;
  return `${pathname}${url.search}${url.hash}`;
}
