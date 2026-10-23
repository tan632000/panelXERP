export const ACCESS_TOKEN_KEY = "accessToken";
export const REFRESH_TOKEN_KEY = "refreshToken";
export const ACCESS_TOKEN_COOKIE = "access_token";
export const AUTH_USER_KEY = "authUser";
export const AUTH_PERMISSIONS_KEY = "authPermissions";

/**
 * As long as the refresh token (backend `JWT_REFRESH_EXPIRES_IN`, 7 days), not the access token:
 * the cookie only lets `middleware.ts` serve the page, and the page itself renews an expired
 * access token. Tying it to the 8-hour access token sent anyone reopening the app the next
 * morning to the login screen while their session was still renewable. Every renewal rewrites
 * it, so the week runs from the last activity, not from the sign-in.
 */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const secureCookie = () =>
  window.location.protocol === "https:" ? "; Secure" : "";

/** A signed-in session the browser accepted but refused to mark with the middleware cookie. */
export class SessionCookieError extends Error {}

/** Whether the marker `middleware.ts` gates every route on survived the write. */
function hasAccessTokenCookie(): boolean {
  const prefix = `${ACCESS_TOKEN_COOKIE}=`;
  return document.cookie
    .split("; ")
    .some((entry) => entry.startsWith(prefix) && entry.length > prefix.length);
}

/**
 * Marks the middleware cookie present and reports whether the browser kept it. The cookie
 * holds a tiny flag, not the JWT — `middleware.ts` only checks it for presence and never
 * decodes it, while the real access token stays in localStorage (read via `getAccessToken`)
 * for the Authorization header. A role's permission list can push that real token well past
 * the ~4KB per-cookie limit browsers enforce; writing it into the cookie directly would get
 * it silently dropped, and the middleware would then bounce a signed-in user back to the
 * login screen on every navigation. `hasAccessTokenCookie` still catches the unrelated case
 * of a browser refusing cookies altogether (privacy mode, third-party blocking, ...).
 */
export function syncAccessTokenCookie(): boolean {
  if (typeof window === "undefined") return false;
  if (!getAccessToken()) return false;

  document.cookie = `${ACCESS_TOKEN_COOKIE}=1; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secureCookie()}`;
  return hasAccessTokenCookie();
}

export function setTokens(accessToken: string, refreshToken: string): boolean {
  if (typeof window === "undefined") return false;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  return syncAccessTokenCookie();
}

export function setAuthSession(user: object, permissions: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  localStorage.setItem(AUTH_PERMISSIONS_KEY, JSON.stringify(permissions));
}

export function getAuthSession(): {
  user: Record<string, unknown> | null;
  permissions: string[];
} {
  if (typeof window === "undefined") {
    return { user: null, permissions: [] };
  }
  const rawUser = localStorage.getItem(AUTH_USER_KEY);
  const rawPermissions = localStorage.getItem(AUTH_PERMISSIONS_KEY);
  return {
    user: rawUser ? (JSON.parse(rawUser) as Record<string, unknown>) : null,
    permissions: rawPermissions ? (JSON.parse(rawPermissions) as string[]) : [],
  };
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_PERMISSIONS_KEY);
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax${secureCookie()}`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function hasPermission(
  permissions: string[],
  required: string,
): boolean {
  if (permissions.includes("*:*")) return true;
  const [resource, action] = required.split(":");
  return (
    permissions.includes(required) ||
    permissions.includes(`${resource}:*`) ||
    permissions.includes(`*:${action}`)
  );
}
