import "@testing-library/jest-dom";

import { afterEach, beforeEach, expect, vi } from "vitest";

import { resetListViewUrlTracking } from "@/kernel/core/lib/list-view-state";

/**
 * Turns a missing translation into a test failure.
 *
 * next-intl reports an unresolved key on `console.error` and falls back to rendering the key
 * path, so a screen that would throw `MISSING_MESSAGE` in the browser still leaves the suite
 * green. Failing here is what makes the guard worth having.
 */
const INTL_ERROR = /MISSING_MESSAGE|IntlError/;

let consoleError: ReturnType<typeof vi.spyOn>;
let intlErrors: string[] = [];

beforeEach(() => {
  // Each test is its own reading session: no list may open with filters a previous test left.
  window.sessionStorage.clear();
  // Nor with filters a previous test mirrored into the address bar.
  window.history.replaceState(null, "", window.location.pathname);
  resetListViewUrlTracking();
  intlErrors = [];
  consoleError = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      const text = args
        .map((arg) => (arg instanceof Error ? arg.message : String(arg)))
        .join(" ");
      if (INTL_ERROR.test(text)) {
        intlErrors.push(text);
        return;
      }
      // Anything else still belongs on the console.
      process.stderr.write(`${text}\n`);
    });
});

afterEach(() => {
  consoleError.mockRestore();
  const missing = intlErrors;
  intlErrors = [];
  expect(
    missing,
    `unresolved translation key(s):\n${missing.join("\n")}`,
  ).toEqual([]);
});
