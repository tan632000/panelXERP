import { beforeEach, describe, expect, it } from "vitest";

import {
  ACCESS_TOKEN_KEY,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_KEY,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
  syncAccessTokenCookie,
} from "@/kernel/core/auth/tokens";

/** What a browser does to an oversized or expired cookie: drops it, leaving localStorage. */
function dropMiddlewareCookie() {
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

describe("auth token storage", () => {
  beforeEach(() => {
    clearTokens();
  });

  it("stores tokens for shared-tab auth and sets the middleware cookie", () => {
    expect(setTokens("access-1", "refresh-1")).toBe(true);

    expect(getAccessToken()).toBe("access-1");
    expect(getRefreshToken()).toBe("refresh-1");
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("access-1");
    expect(window.localStorage.getItem(REFRESH_TOKEN_KEY)).toBe("refresh-1");
    expect(document.cookie).toContain(`${ACCESS_TOKEN_COOKIE}=1`);

    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(document.cookie).not.toContain(`${ACCESS_TOKEN_COOKIE}=access-1`);
  });

  it("rewrites the middleware cookie a browser dropped from the stored token", () => {
    setTokens("access-1", "refresh-1");
    dropMiddlewareCookie();
    expect(document.cookie).not.toContain(`${ACCESS_TOKEN_COOKIE}=1`);

    expect(syncAccessTokenCookie()).toBe(true);
    expect(document.cookie).toContain(`${ACCESS_TOKEN_COOKIE}=1`);
  });

  it("reports failure when there is no stored token to mark the session with", () => {
    expect(syncAccessTokenCookie()).toBe(false);
  });

  it("keeps the middleware cookie small even for a token too large to fit in a real cookie", () => {
    // Chrome/Firefox/Safari all cap a single cookie's name=value pair at ~4096 bytes and
    // silently drop it past that — a role with a large permission list produces a JWT well
    // past that limit. The full token must stay out of the cookie so login never regresses
    // into a middleware redirect loop for those roles.
    const oversizedToken = "x".repeat(6000);
    setTokens(oversizedToken, "refresh-2");

    expect(getAccessToken()).toBe(oversizedToken);
    const cookiePair = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${ACCESS_TOKEN_COOKIE}=`));
    expect(cookiePair?.length).toBeLessThan(100);
  });
});
