/** The home page, which forwards the reader to the first screen they may open. */
export const DEFAULT_POST_LOGIN_PATH = "/";

const LOCALE_PREFIX_RE = /^\/(vi|en)(?=\/|$)/;
/** The signed-out screens: landing back on one after signing in is a bounce, not a destination. */
const AUTH_PATH_RE = /^\/((vi|en)\/)?(login|forgot-password|reset-password)$/;

export function getPostLoginFallback(currentPathname: string): string {
  const locale = currentPathname.match(LOCALE_PREFIX_RE)?.[1];
  if (locale && locale !== "vi") {
    return `/${locale}`;
  }
  return DEFAULT_POST_LOGIN_PATH;
}

function isAuthPathname(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return AUTH_PATH_RE.test(normalized);
}

export function resolveSafeRedirectPath(
  from: string | null | undefined,
  fallback: string = DEFAULT_POST_LOGIN_PATH,
): string {
  if (!from) return fallback;

  const trimmed = from.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\")
  ) {
    return fallback;
  }
  // Only the path can steer the browser off-site; a list link's query may quote a URL.
  const pathname = trimmed.split("?")[0]?.split("#")[0] ?? "";
  if (pathname.includes("://") || pathname.includes("\\")) {
    return fallback;
  }
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    isAuthPathname(pathname)
  ) {
    return fallback;
  }

  return trimmed;
}

export function resolvePostLoginPath(search: string, pathname: string): string {
  const from = new URLSearchParams(search).get("from");
  return resolveSafeRedirectPath(from, getPostLoginFallback(pathname));
}
