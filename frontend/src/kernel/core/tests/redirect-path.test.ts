import { describe, expect, it } from "vitest";

import {
  DEFAULT_POST_LOGIN_PATH,
  getPostLoginFallback,
  resolvePostLoginPath,
  resolveSafeRedirectPath,
} from "@/kernel/core/auth/redirect-path";

describe("getPostLoginFallback", () => {
  it("uses the home page for default locale paths", () => {
    expect(getPostLoginFallback("/login")).toBe("/");
    expect(getPostLoginFallback("/vi/login")).toBe("/");
  });

  it("keeps a non-default locale prefix", () => {
    expect(getPostLoginFallback("/en/login")).toBe("/en");
  });
});

describe("resolveSafeRedirectPath", () => {
  it("keeps a shared list link whose filters quote a URL", () => {
    const link = "/sales/order?lv=1&search=https%3A%2F%2Fexample.com";
    expect(resolveSafeRedirectPath(decodeURIComponent(link))).toBe(
      decodeURIComponent(link),
    );
    expect(resolveSafeRedirectPath("/\\evil.example?x=1")).toBe(
      DEFAULT_POST_LOGIN_PATH,
    );
  });

  it("returns fallback when from is missing or external", () => {
    expect(resolveSafeRedirectPath(null)).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(resolveSafeRedirectPath("")).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(resolveSafeRedirectPath("https://evil.example")).toBe(
      DEFAULT_POST_LOGIN_PATH,
    );
    expect(resolveSafeRedirectPath("//evil.example")).toBe(
      DEFAULT_POST_LOGIN_PATH,
    );
    expect(resolveSafeRedirectPath("/\\evil.example")).toBe(
      DEFAULT_POST_LOGIN_PATH,
    );
    expect(resolveSafeRedirectPath("sales/product")).toBe(
      DEFAULT_POST_LOGIN_PATH,
    );
  });

  it("rejects login paths to avoid a redirect loop", () => {
    expect(resolveSafeRedirectPath("/login")).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(resolveSafeRedirectPath("/en/login")).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(resolveSafeRedirectPath("/vi/login/")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("keeps internal app paths including locale and query", () => {
    expect(resolveSafeRedirectPath("/sales/product")).toBe("/sales/product");
    expect(resolveSafeRedirectPath("/en/sales/product")).toBe(
      "/en/sales/product",
    );
    expect(resolveSafeRedirectPath("/sales/product?tab=1")).toBe(
      "/sales/product?tab=1",
    );
  });
});

describe("resolvePostLoginPath", () => {
  it("reads the from query after URL decoding", () => {
    expect(resolvePostLoginPath("?from=%2Fsales%2Fproduct", "/login")).toBe(
      "/sales/product",
    );
  });

  it("falls back when from is absent", () => {
    expect(resolvePostLoginPath("", "/en/login")).toBe("/en");
  });
});

describe("resolveSafeRedirectPath — signed-out screens", () => {
  it("refuses forgot-password and reset-password as a destination", () => {
    // Signing in and landing back on a password screen is a bounce, not where the reader
    // was headed; the same rule /login has always had.
    expect(resolveSafeRedirectPath("/forgot-password")).toBe("/");
    expect(resolveSafeRedirectPath("/en/reset-password")).toBe("/");
    expect(resolveSafeRedirectPath("/vi/forgot-password", "/en/sales")).toBe(
      "/en/sales",
    );
  });

  it("still allows a path that merely starts with one of those names", () => {
    expect(resolveSafeRedirectPath("/sales/reset-password-report")).toBe(
      "/sales/reset-password-report",
    );
  });
});
