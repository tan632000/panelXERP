import { describe, expect, it } from "vitest";

import {
  formatIsoDisplay,
  parseIsoDate,
  toIsoDate,
} from "@/kernel/core/lib/date-picker-utils";

describe("parseIsoDate", () => {
  it("parses a plain yyyy-MM-dd date", () => {
    const date = parseIsoDate("2026-05-27");
    expect(date && toIsoDate(date)).toBe("2026-05-27");
  });

  it("falls back to a full ISO datetime, e.g. a date column serialized with a time component", () => {
    const date = parseIsoDate("2026-05-27T17:00:00.000Z");
    expect(date).toBeDefined();
  });

  it("returns undefined for an empty or invalid string", () => {
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate("not-a-date")).toBeUndefined();
  });
});

describe("formatIsoDisplay", () => {
  it("formats a plain date as dd/MM/yyyy", () => {
    expect(formatIsoDisplay("2026-05-27")).toBe("27/05/2026");
  });

  it("formats a full ISO datetime as dd/MM/yyyy instead of leaking the raw string", () => {
    // Noon UTC stays on the same calendar day across any realistic local timezone, so this
    // assertion isn't sensitive to the timezone the test happens to run in.
    expect(formatIsoDisplay("2026-05-27T12:00:00.000Z")).toBe("27/05/2026");
  });

  it("falls back to the raw input when it cannot be parsed at all", () => {
    expect(formatIsoDisplay("not-a-date")).toBe("not-a-date");
  });
});
