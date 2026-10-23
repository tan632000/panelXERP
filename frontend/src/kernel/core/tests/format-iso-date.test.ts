import { describe, expect, it } from "vitest";

import { formatIsoDate } from "@/kernel/core/lib/formatters";

describe("formatIsoDate", () => {
  it("formats YYYY-MM-DD as DD/MM/YYYY", () => {
    expect(formatIsoDate("2026-09-18")).toBe("18/09/2026");
    expect(formatIsoDate("2026-01-05")).toBe("05/01/2026");
  });

  it("tolerates ISO datetimes by reading the date part", () => {
    expect(formatIsoDate("2026-09-18T07:00:00.000Z")).toBe("18/09/2026");
  });

  it("returns the input when it is not a date", () => {
    expect(formatIsoDate("")).toBe("");
    expect(formatIsoDate(null)).toBe("");
    expect(formatIsoDate("not-a-date")).toBe("not-a-date");
  });
});
