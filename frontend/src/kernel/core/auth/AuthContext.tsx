"use client";

import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import api, {
  PERMISSIONS_STALE_EVENT,
  SESSION_EXPIRED_EVENT,
} from "@/kernel/core/api/api";
import { resolvePostLoginPath } from "@/kernel/core/auth/redirect-path";
import {
  ACCESS_TOKEN_KEY,
  AUTH_USER_KEY,
  REFRESH_TOKEN_KEY,
  SessionCookieError,
  clearTokens,
  getAccessToken,
  getAuthSession,
  hasPermission,
  setAuthSession,
  setTokens,
  syncAccessTokenCookie,
} from "@/kernel/core/auth/tokens";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { clearAllListViewState } from "@/kernel/core/lib/list-view-state";

import type {
  AuthUser,
  LoginResponse,
  MeResponse,
} from "@/kernel/core/auth/types";

interface AuthState {
  user: AuthUser | null;
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Adopts a profile the server just rewrote, so every screen reads the new one at once. */
  applySessionUpdate: (data: MeResponse) => void;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** How often an open tab re-reads its permissions, and the shortest gap between two reads. */
const PERMISSIONS_REFRESH_INTERVAL_MS = 60_000;
const PERMISSIONS_REFRESH_MIN_GAP_MS = 10_000;

function applySession(
  data: Pick<LoginResponse, "user" | "permissions">,
): AuthState {
  setAuthSession(data.user, data.permissions);
  return {
    user: data.user,
    permissions: data.permissions,
    isLoading: false,
    isAuthenticated: true,
  };
}

const INITIAL_AUTH_STATE: AuthState = {
  user: null,
  permissions: [],
  isLoading: true,
  isAuthenticated: false,
};

const SIGNED_OUT_STATE: AuthState = {
  user: null,
  permissions: [],
  isLoading: false,
  isAuthenticated: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("auth");
  const { showError } = useNotification();
  const [state, setState] = useState<AuthState>(INITIAL_AUTH_STATE);

  useEffect(() => {
    let cancelled = false;

    const hydrateSession = async () => {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setState(SIGNED_OUT_STATE);
        }
        return;
      }

      // The stored token outlives the middleware cookie, which the browser may have dropped
      // or expired on its own. Rewrite it, and if the browser will not keep it, sign out
      // rather than restore a session every navigation would bounce back to the login screen.
      if (!syncAccessTokenCookie()) {
        clearTokens();
        if (!cancelled) setState(SIGNED_OUT_STATE);
        return;
      }

      const cached = getAuthSession();
      if (cached.user && !cancelled) {
        setState({
          user: cached.user as unknown as AuthUser,
          permissions: cached.permissions,
          isLoading: false,
          isAuthenticated: true,
        });
      }

      try {
        const { data } = await api.get<MeResponse>(apiRoutes.auth.me);
        if (!cancelled) setState(applySession(data));
      } catch (error) {
        if (cancelled) return;

        // A 401 here means the interceptor already tried to renew and the server refused;
        // only then is the session over. A network error, timeout or 5xx on page load (a
        // restarting backend) keeps the cached session instead of signing the user out.
        const unauthorized =
          axios.isAxiosError(error) && error.response?.status === 401;
        if (unauthorized || !cached.user) {
          clearTokens();
          setState(SIGNED_OUT_STATE);
        }
      }
    };

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // The server reloads a role's permissions on every request, so an administrator's change
  // takes effect there at once; this keeps the screen in step without a reload. The profile is
  // re-read when the tab regains focus, on a slow timer, and whenever a request comes back 403.
  const isAuthenticated = state.isAuthenticated;
  useEffect(() => {
    if (!isAuthenticated) return;
    let lastRefresh = Date.now();
    let inFlight = false;

    const refreshPermissions = async () => {
      if (
        inFlight ||
        Date.now() - lastRefresh < PERMISSIONS_REFRESH_MIN_GAP_MS
      ) {
        return;
      }
      if (!getAccessToken()) return;
      inFlight = true;
      lastRefresh = Date.now();
      try {
        const { data } = await api.get<MeResponse>(apiRoutes.auth.me);
        setState((previous) =>
          previous.isAuthenticated ? applySession(data) : previous,
        );
      } catch {
        // A failed read leaves the current permissions; the 401 path signs out on its own.
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshPermissions();
    };
    const onStale = () => void refreshPermissions();
    const timer = window.setInterval(onStale, PERMISSIONS_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", onStale);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PERMISSIONS_STALE_EVENT, onStale);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onStale);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(PERMISSIONS_STALE_EVENT, onStale);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const syncAuthState = (event: StorageEvent) => {
      if (
        ![ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, AUTH_USER_KEY].includes(
          event.key ?? "",
        )
      ) {
        return;
      }

      const token = getAccessToken();
      const cached = getAuthSession();
      if (!token || !cached.user) {
        setState(SIGNED_OUT_STATE);
        router.push("/login");
        return;
      }

      setState({
        user: cached.user as unknown as AuthUser,
        permissions: cached.permissions,
        isLoading: false,
        isAuthenticated: true,
      });
    };

    window.addEventListener("storage", syncAuthState);
    return () => window.removeEventListener("storage", syncAuthState);
  }, [router]);

  // A request in *this* tab hit an unrecoverable 401 (expired/invalid session, refresh failed
  // or absent) — the interceptor already cleared the tokens; tell the user why their action
  // just silently did nothing and send them back to log in, instead of leaving a dead form.
  useEffect(() => {
    const handleSessionExpired = () => {
      setState(SIGNED_OUT_STATE);
      showError(t("sessionExpired"));
      router.push("/login");
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [router, showError, t]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { data } = await api.post<LoginResponse>(apiRoutes.auth.login, {
        username,
        password,
      });

      // `middleware.ts` gates routes on the cookie, not on localStorage. If the browser
      // refused it, navigating on would bounce straight back to the login screen forever, so
      // fail the sign-in visibly instead.
      if (!setTokens(data.accessToken, data.refreshToken)) {
        clearTokens();
        throw new SessionCookieError("Browser refused the session cookie");
      }

      // A new session opens every list clean, however the previous one ended (sign-out,
      // expiry, another tab) — list filters otherwise live for the whole browser tab.
      clearAllListViewState();
      // Query results belong to the account that fetched them: another account signing in
      // (a storekeeper after an engineer) must not be handed the earlier one's cached
      // responses, which may carry fields this account is not entitled to.
      queryClient.clear();
      setState(applySession(data));
      router.replace(
        resolvePostLoginPath(window.location.search, window.location.pathname),
      );
    },
    [router, queryClient],
  );

  const applySessionUpdate = useCallback((data: MeResponse) => {
    setState(applySession(data));
  }, []);

  const logout = useCallback(() => {
    // Frees this device's session on the server, so it stops counting against the account's
    // device limit. Sent with plain axios and the token read now: the shared instance would
    // try to renew an expired token after the pair below is already cleared, and report the
    // sign-out the user just asked for as an expired session. Best effort — a failure only
    // leaves the session to expire on its own.
    const accessToken = getAccessToken();
    if (accessToken) {
      void axios
        .post(`${api.defaults.baseURL}${apiRoutes.auth.logout}`, null, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .catch(() => undefined);
    }
    clearTokens();
    clearAllListViewState();
    queryClient.clear();
    setState(SIGNED_OUT_STATE);
    router.push("/login");
  }, [router, queryClient]);

  const can = useCallback(
    (permission: string) => hasPermission(state.permissions, permission),
    [state.permissions],
  );

  const value = useMemo(
    () => ({ ...state, login, logout, can, applySessionUpdate }),
    [state, login, logout, can, applySessionUpdate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The auth state when there is a provider, `null` when there is not.
 *
 * A picker dialog or a detail sub-table renders outside the app shell, so a component the
 * shared table uses must be able to ask about permissions without requiring one.
 */
export function useOptionalAuth() {
  return useContext(AuthContext);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
