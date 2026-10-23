import axios, { type InternalAxiosRequestConfig } from "axios";

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "@/kernel/core/auth/tokens";
import { DEFAULT_API_TIMEOUT_MS } from "@/kernel/core/constants/api";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

class StaleRefreshTokenError extends Error {}

/** The server answered the refresh call and turned the token down. */
function isRefreshRejected(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 400 || status === 401 || status === 403;
}

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1",
  timeout: DEFAULT_API_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

/** Fired once per expiry so `AuthContext` can sign out, notify, and redirect in this tab. */
export const SESSION_EXPIRED_EVENT = "auth:session-expired";

// Several requests can fail with 401 around the same moment (a page's parallel queries); only
// the first should trigger the sign-out flow. Reset on any successful response so a later,
// unrelated expiry (hours from now, after a fresh login) is reported again.
let sessionExpiryNotified = false;

function notifySessionExpired() {
  if (sessionExpiryNotified || typeof window === "undefined") return;
  sessionExpiryNotified = true;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

/**
 * Fired when the server refuses a request with 403: the role's permissions may have changed
 * since this tab loaded them, so `AuthContext` reloads them and the screen stops offering
 * what the administrator just took away.
 */
export const PERMISSIONS_STALE_EVENT = "auth:permissions-stale";

let refreshRequest: Promise<{
  accessToken: string;
  refreshToken: string;
}> | null = null;

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    sessionExpiryNotified = false;
    return response;
  },
  async (error) => {
    if (error.response?.status === 403 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(PERMISSIONS_STALE_EVENT));
    }
    const original = error.config as RetryConfig | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      typeof window !== "undefined"
    ) {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        original._retry = true;
        try {
          refreshRequest ??= axios
            .post<{ accessToken: string; refreshToken: string }>(
              `${api.defaults.baseURL}${apiRoutes.auth.refresh}`,
              { refreshToken },
            )
            .then((response) => response.data)
            .finally(() => {
              refreshRequest = null;
            });
          const data = await refreshRequest;
          const currentRefreshToken = getRefreshToken();
          if (
            currentRefreshToken !== refreshToken &&
            currentRefreshToken !== data.refreshToken
          ) {
            throw new StaleRefreshTokenError(
              "Refresh token changed during renewal",
            );
          }
          // A rotated token the browser will not keep as the middleware cookie leaves the
          // session unusable for navigation, so end it here rather than let the next route
          // change bounce back to the login screen.
          if (!setTokens(data.accessToken, data.refreshToken)) {
            clearTokens();
            notifySessionExpired();
            return Promise.reject(error);
          }
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch (refreshError) {
          if (refreshError instanceof StaleRefreshTokenError) {
            return Promise.reject(error);
          }
          // Another tab renewed first: the token sent here was rotated out, so the server
          // refused it, but this tab's storage already holds the new pair.
          const rotatedAccessToken = getAccessToken();
          if (getRefreshToken() !== refreshToken && rotatedAccessToken) {
            original.headers.Authorization = `Bearer ${rotatedAccessToken}`;
            return api(original);
          }
          // Only the server refusing the refresh token ends the session. A network error, a
          // timeout or a 5xx (a restarting backend) says nothing about it, so the tokens stay
          // and the next request tries again.
          if (!isRefreshRejected(refreshError)) {
            return Promise.reject(error);
          }
          clearTokens();
          notifySessionExpired();
        }
      } else {
        clearTokens();
        notifySessionExpired();
      }
    }
    return Promise.reject(error);
  },
);

export default api;
