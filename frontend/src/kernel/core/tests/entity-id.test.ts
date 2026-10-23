import { describe, expect, it } from "vitest";

import { parsePositiveIntId } from "@/kernel/core/lib/entity-id";

describe("parsePositiveIntId", () => {
  it("parses positive integer strings", () => {
    expect(parsePositiveIntId("12")).toBe(12);
  });

  it("parses positive integers", () => {
    expect(parsePositiveIntId(7)).toBe(7);
  });

  it("rejects invalid values", () => {
    expect(parsePositiveIntId("contacts")).toBeNull();
    expect(parsePositiveIntId("0")).toBeNull();
    expect(parsePositiveIntId("-1")).toBeNull();
    expect(parsePositiveIntId("12.5")).toBeNull();
    expect(parsePositiveIntId(["12", "13"])).toBe(12);
    expect(parsePositiveIntId(undefined)).toBeNull();
    expect(parsePositiveIntId(null)).toBeNull();
  });
});
