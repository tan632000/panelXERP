import { describe, expect, it } from "vitest";

import {
  documentValidity,
  parseDayMonthYear,
  parseDocumentDate,
} from "@/kernel/core/lib/document-validity";

const today = new Date(2026, 7, 22);

describe("parseDayMonthYear", () => {
  it("reads the dd/mm/yyyy form the mock data uses", () => {
    expect(parseDayMonthYear("02/03/2028")).toEqual(new Date(2028, 2, 2));
  });

  it("rejects an empty value", () => {
    expect(parseDayMonthYear("")).toBeNull();
  });

  it("rejects a date the calendar would roll over", () => {
    expect(parseDayMonthYear("31/02/2026")).toBeNull();
  });
});

describe("documentValidity", () => {
  it("reports a locked document as ended, ignoring its expiry date", () => {
    expect(
      documentValidity({ expiryDate: "01/01/2020", locked: true }, today),
    ).toEqual({ state: "locked", days: 0 });
  });

  it("treats a document with no expiry date as open-ended", () => {
    expect(documentValidity({ expiryDate: "" }, today).state).toBe("unlimited");
  });

  it("counts days since an expiry that has passed", () => {
    expect(documentValidity({ expiryDate: "12/08/2026" }, today)).toEqual({
      state: "expired",
      days: -10,
    });
  });

  it("warns inside the 30-day window", () => {
    expect(documentValidity({ expiryDate: "21/09/2026" }, today)).toEqual({
      state: "expiringSoon",
      days: 30,
    });
  });

  it("stays valid one day past the warning window", () => {
    expect(documentValidity({ expiryDate: "22/09/2026" }, today)).toEqual({
      state: "valid",
      days: 31,
    });
  });

  it("flags a document expiring today rather than calling it expired", () => {
    expect(documentValidity({ expiryDate: "22/08/2026" }, today)).toEqual({
      state: "expiringSoon",
      days: 0,
    });
  });
});

describe("parseDocumentDate", () => {
  it("reads the yyyy-mm-dd form the API returns", () => {
    expect(parseDocumentDate("2028-03-02")).toEqual(new Date(2028, 2, 2));
  });

  it("still reads the dd/mm/yyyy form", () => {
    expect(parseDocumentDate("02/03/2028")).toEqual(new Date(2028, 2, 2));
  });

  it("rejects an ISO date the calendar would roll over", () => {
    expect(parseDocumentDate("2026-02-31")).toBeNull();
  });

  it("rejects an empty or malformed value", () => {
    expect(parseDocumentDate("")).toBeNull();
    expect(parseDocumentDate("2026-8-2")).toBeNull();
    expect(parseDocumentDate("not a date")).toBeNull();
  });
});

describe("documentValidity on API dates", () => {
  it("counts down from an ISO expiry exactly as from the slashed form", () => {
    expect(documentValidity({ expiryDate: "2026-09-22" }, today)).toEqual({
      state: "valid",
      days: 31,
    });
  });

  it("reports the overdue days for an expired ISO date", () => {
    expect(documentValidity({ expiryDate: "2026-08-20" }, today)).toEqual({
      state: "expired",
      days: -2,
    });
  });

  it("keeps the lock ahead of an ISO expiry in the future", () => {
    expect(
      documentValidity({ expiryDate: "2030-01-01", locked: true }, today).state,
    ).toBe("locked");
  });
});
