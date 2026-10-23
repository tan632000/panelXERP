import { describe, expect, it } from "vitest";

import { formatStoredQuantity } from "@/kernel/core/lib/formatters";

describe("formatStoredQuantity", () => {
  it("groups thousands with dots and decimals with commas", () => {
    expect(formatStoredQuantity("1500.500", "-")).toBe("1.500,5");
    expect(formatStoredQuantity(1234567.89, "-")).toBe("1.234.567,89");
  });

  it("hides decimals when the stored value has none", () => {
    expect(formatStoredQuantity("950.000", "-")).toBe("950");
    expect(formatStoredQuantity("1000", "-")).toBe("1.000");
  });

  it("falls back to empty for blank or non-numeric input", () => {
    expect(formatStoredQuantity(null, "-")).toBe("-");
    expect(formatStoredQuantity(undefined, "-")).toBe("-");
    expect(formatStoredQuantity("", "-")).toBe("-");
    expect(formatStoredQuantity("3 coils", "-")).toBe("-");
  });
});
