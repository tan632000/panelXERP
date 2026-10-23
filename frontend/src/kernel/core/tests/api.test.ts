import axios, { AxiosError, type AxiosAdapter } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api, { SESSION_EXPIRED_EVENT } from "@/kernel/core/api/api";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "@/kernel/core/auth/tokens";

const okAdapter: AxiosAdapter = async (config) => ({
  config,
  data: { ok: true },
  headers: {},
  status: 200,
  statusText: "OK",
});

/** The refresh endpoint answering 401: the server itself refused the refresh token. */
function refreshRejected() {
  return new AxiosError("revoked", undefined, undefined, undefined, {
    config: {} as never,
    data: {},
    headers: {},
    status: 401,
    statusText: "Unauthorized",
  });
}

const expiredAdapter: AxiosAdapter = async (config) => {
  throw new AxiosError("expired", undefined, config, undefined, {
    config,
    data: {},
    headers: {},
    status: 401,
    statusText: "Unauthorized",
  });
};

describe("api auth refresh", () => {
  afterEach(() => {
    clearTokens();
    vi.restoreAllMocks();
  });

  // The "notified" guard is a module-level singleton (by design: several requests can 401
  // around the same moment, and only the first should fire). It only resets on a *successful*
  // response, so a prior test's unrecovered 401 would otherwise leak into the next one here.
  beforeEach(async () => {
    await api.get("/warmup", { adapter: okAdapter });
  });

  it("stores the rotated refresh token returned by backend", async () => {
    setTokens("access-1", "refresh-1");
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { accessToken: "access-2", refreshToken: "refresh-2" },
    });

    let attempts = 0;
    const adapter: AxiosAdapter = async (config) => {
      attempts += 1;
      if (attempts === 1) {
        throw new AxiosError("expired", undefined, config, undefined, {
          config,
          data: {},
          headers: {},
          status: 401,
          statusText: "Unauthorized",
        });
      }
      return {
        config,
        data: { ok: true },
        headers: {},
        status: 200,
        statusText: "OK",
      };
    };

    await expect(api.get("/protected", { adapter })).resolves.toMatchObject({
      data: { ok: true },
    });
    expect(getAccessToken()).toBe("access-2");
    expect(getRefreshToken()).toBe("refresh-2");
  });

  it("clears tokens when refresh fails", async () => {
    setTokens("access-1", "refresh-1");
    vi.spyOn(axios, "post").mockRejectedValue(refreshRejected());

    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError("expired", undefined, config, undefined, {
        config,
        data: {},
        headers: {},
        status: 401,
        statusText: "Unauthorized",
      });
    };

    await expect(api.get("/protected", { adapter })).rejects.toThrow("expired");
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("keeps the session when the refresh call fails without a server answer", async () => {
    setTokens("access-1", "refresh-1");
    vi.spyOn(axios, "post").mockRejectedValue(new Error("Network Error"));
    const onSessionExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);

    try {
      await expect(
        api.get("/protected", { adapter: expiredAdapter }),
      ).rejects.toThrow("expired");
      expect(getAccessToken()).toBe("access-1");
      expect(getRefreshToken()).toBe("refresh-1");
      expect(onSessionExpired).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    }
  });

  it("retries with the pair another tab rotated in instead of signing out", async () => {
    setTokens("access-1", "refresh-1");
    // Another tab renews first: by the time this tab's refresh is refused, storage holds
    // that tab's new pair.
    vi.spyOn(axios, "post").mockImplementation(async () => {
      setTokens("access-2", "refresh-2");
      throw refreshRejected();
    });

    let attempts = 0;
    const adapter: AxiosAdapter = async (config) => {
      attempts += 1;
      if (attempts === 1) return expiredAdapter(config);
      expect(config.headers.Authorization).toBe("Bearer access-2");
      return {
        config,
        data: { ok: true },
        headers: {},
        status: 200,
        statusText: "OK",
      };
    };

    await expect(api.get("/protected", { adapter })).resolves.toMatchObject({
      data: { ok: true },
    });
    expect(getRefreshToken()).toBe("refresh-2");
  });

  it("notifies once when a 401 cannot be recovered, so the app can sign out and redirect", async () => {
    setTokens("access-1", "refresh-1");
    vi.spyOn(axios, "post").mockRejectedValue(refreshRejected());
    const onSessionExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);

    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError("expired", undefined, config, undefined, {
        config,
        data: {},
        headers: {},
        status: 401,
        statusText: "Unauthorized",
      });
    };

    try {
      await expect(api.get("/protected", { adapter })).rejects.toThrow(
        "expired",
      );
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    }
  });

  it("notifies immediately on a 401 with no refresh token to try at all", async () => {
    setTokens("access-1", "");
    const onSessionExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);

    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError("expired", undefined, config, undefined, {
        config,
        data: {},
        headers: {},
        status: 401,
        statusText: "Unauthorized",
      });
    };

    try {
      await expect(api.get("/protected", { adapter })).rejects.toThrow(
        "expired",
      );
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    }
  });

  it("re-arms the notification after a later successful request", async () => {
    setTokens("access-1", "refresh-1");
    vi.spyOn(axios, "post").mockRejectedValue(refreshRejected());
    const onSessionExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);

    const failingAdapter: AxiosAdapter = async (config) => {
      throw new AxiosError("expired", undefined, config, undefined, {
        config,
        data: {},
        headers: {},
        status: 401,
        statusText: "Unauthorized",
      });
    };

    try {
      await expect(
        api.get("/protected", { adapter: failingAdapter }),
      ).rejects.toThrow("expired");
      expect(onSessionExpired).toHaveBeenCalledTimes(1);

      setTokens("access-2", "refresh-2");
      await expect(
        api.get("/protected", { adapter: okAdapter }),
      ).resolves.toMatchObject({ data: { ok: true } });

      await expect(
        api.get("/protected", { adapter: failingAdapter }),
      ).rejects.toThrow("expired");
      expect(onSessionExpired).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    }
  });

  it("shares one refresh request across concurrent 401 responses", async () => {
    setTokens("access-1", "refresh-1");
    const deferred: {
      resolve?: (value: {
        data: { accessToken: string; refreshToken: string };
      }) => void;
    } = {};
    const refreshPromise = new Promise<{
      data: { accessToken: string; refreshToken: string };
    }>((resolve) => {
      deferred.resolve = resolve;
    });
    const post = vi.spyOn(axios, "post").mockReturnValue(refreshPromise);

    const seen = new Set<string>();
    const adapter: AxiosAdapter = async (config) => {
      const url = config.url ?? "";
      if (!seen.has(url)) {
        seen.add(url);
        throw new AxiosError("expired", undefined, config, undefined, {
          config,
          data: {},
          headers: {},
          status: 401,
          statusText: "Unauthorized",
        });
      }
      return {
        config,
        data: { ok: true },
        headers: {},
        status: 200,
        statusText: "OK",
      };
    };

    const requests = Promise.all([
      api.get("/protected-a", { adapter }),
      api.get("/protected-b", { adapter }),
    ]);

    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    if (!deferred.resolve) throw new Error("refresh resolver not set");
    deferred.resolve({
      data: { accessToken: "access-2", refreshToken: "refresh-2" },
    });

    await expect(requests).resolves.toHaveLength(2);
    expect(getAccessToken()).toBe("access-2");
    expect(getRefreshToken()).toBe("refresh-2");
  });

  it("does not restore tokens when logout clears storage during refresh", async () => {
    setTokens("access-1", "refresh-1");
    const deferred: {
      resolve?: (value: {
        data: { accessToken: string; refreshToken: string };
      }) => void;
    } = {};
    vi.spyOn(axios, "post").mockReturnValue(
      new Promise((resolve) => {
        deferred.resolve = resolve;
      }),
    );

    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError("expired", undefined, config, undefined, {
        config,
        data: {},
        headers: {},
        status: 401,
        statusText: "Unauthorized",
      });
    };

    const request = api.get("/protected", { adapter });
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    clearTokens();
    if (!deferred.resolve) throw new Error("refresh resolver not set");
    deferred.resolve({
      data: { accessToken: "access-2", refreshToken: "refresh-2" },
    });

    await expect(request).rejects.toThrow("expired");
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("does not clear a newer session when stale refresh resolves", async () => {
    setTokens("access-1", "refresh-1");
    const deferred: {
      resolve?: (value: {
        data: { accessToken: string; refreshToken: string };
      }) => void;
    } = {};
    vi.spyOn(axios, "post").mockReturnValue(
      new Promise((resolve) => {
        deferred.resolve = resolve;
      }),
    );

    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError("expired", undefined, config, undefined, {
        config,
        data: {},
        headers: {},
        status: 401,
        statusText: "Unauthorized",
      });
    };

    const request = api.get("/protected", { adapter });
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    setTokens("access-new", "refresh-new");
    if (!deferred.resolve) throw new Error("refresh resolver not set");
    deferred.resolve({
      data: { accessToken: "access-2", refreshToken: "refresh-2" },
    });

    await expect(request).rejects.toThrow("expired");
    expect(getAccessToken()).toBe("access-new");
    expect(getRefreshToken()).toBe("refresh-new");
  });
});
