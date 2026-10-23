import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUERY_RETRY,
  RATE_LIMITED_QUERY_RETRY,
  RATE_LIMIT_MAX_RETRY_DELAY_MS,
} from "@/kernel/core/constants/list-ui";
import {
  queryRetryDelay,
  shouldRetryQuery,
} from "@/kernel/core/lib/query-retry";

function apiError(status: number, headers: Record<string, string> = {}) {
  return { isAxiosError: true, response: { status, headers, data: {} } };
}

describe("shouldRetryQuery", () => {
  it("keeps retrying a throttled read up to its own budget", () => {
    const throttled = apiError(429);
    expect(shouldRetryQuery(RATE_LIMITED_QUERY_RETRY - 1, throttled)).toBe(
      true,
    );
    expect(shouldRetryQuery(RATE_LIMITED_QUERY_RETRY, throttled)).toBe(false);
  });

  it("does not repeat a request the server judged wrong", () => {
    for (const status of [400, 403, 404, 409, 422]) {
      expect(shouldRetryQuery(0, apiError(status))).toBe(false);
    }
  });

  it("retries a server failure, a timeout or a network error once", () => {
    for (const error of [apiError(500), apiError(408), new Error("offline")]) {
      expect(shouldRetryQuery(DEFAULT_QUERY_RETRY - 1, error)).toBe(true);
      expect(shouldRetryQuery(DEFAULT_QUERY_RETRY, error)).toBe(false);
    }
  });
});

describe("queryRetryDelay", () => {
  it("waits out the block the server names in Retry-After", () => {
    expect(queryRetryDelay(0, apiError(429, { "retry-after": "7" }))).toBe(
      7000,
    );
  });

  it("never waits longer than the rate window", () => {
    expect(queryRetryDelay(0, apiError(429, { "retry-after": "3600" }))).toBe(
      RATE_LIMIT_MAX_RETRY_DELAY_MS,
    );
  });

  it("backs off exponentially when no wait is named", () => {
    expect(queryRetryDelay(0, apiError(429))).toBe(1000);
    expect(queryRetryDelay(2, apiError(429))).toBe(4000);
    expect(queryRetryDelay(1, apiError(500))).toBe(2000);
  });
});
