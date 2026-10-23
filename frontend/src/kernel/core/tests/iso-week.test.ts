import { describe, expect, it } from "vitest";

import { toIsoWeekLabel } from "@/kernel/core/lib/iso-week";

describe("toIsoWeekLabel", () => {
  it("labels a mid-year date like the mock", () => {
    expect(toIsoWeekLabel("2026-07-20")).toBe("W30/2026");
  });

  it("starts the year on week one", () => {
    expect(toIsoWeekLabel("2026-01-01")).toBe("W01/2026");
  });

  it("credits late-December days to next year's week one", () => {
    expect(toIsoWeekLabel("2025-12-29")).toBe("W01/2026");
  });

  it("stays blank without a valid date", () => {
    expect(toIsoWeekLabel(undefined)).toBe("");
    expect(toIsoWeekLabel("not-a-date")).toBe("");
  });
});
