import { describe, expect, it } from "vitest";

import { getPostLoginFallback } from "@/kernel/core/auth/redirect-path";

describe("getPostLoginFallback", () => {
  it("uses the home page for default locale paths", () => {
    expect(getPostLoginFallback("/login")).toBe("/");
    expect(getPostLoginFallback("/vi/login")).toBe("/");
  });

  it("keeps a non-default locale prefix", () => {
    expect(getPostLoginFallback("/en/login")).toBe("/en");
  });
});
