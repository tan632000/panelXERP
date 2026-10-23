import { describe, expect, it } from "vitest";

import { apiRoutes } from "@/kernel/core/constants/apiRoutes";

describe("apiRoutes", () => {
  it("should expose auth me endpoint", () => {
    expect(apiRoutes.auth.me).toBe("/auth/me");
  });

  it("should expose health endpoint", () => {
    expect(apiRoutes.health).toBe("/health");
  });
});
