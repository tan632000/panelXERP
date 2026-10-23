import { describe, expect, it } from "vitest";

import { foldSearchText, includesFolded } from "@/kernel/core/lib/search-text";

describe("includesFolded", () => {
  it("finds an old-style tone mark from a new-style query and back", () => {
    expect(includesFolded("Bas khóa khung đỡ Ø9 46x20x2", "bas khoá")).toBe(
      true,
    );
    expect(includesFolded("Hoá chất xử lý", "Hóa chất")).toBe(true);
  });

  it("matches a query typed without any tone marks", () => {
    expect(
      includesFolded("Công ty Cổ phần Lâm sản Nam Định", "lam san nam dinh"),
    ).toBe(true);
  });

  it("matches decomposed (NFD) input from some input methods", () => {
    expect(includesFolded("Bas khóa", "khóa".normalize("NFD"))).toBe(true);
  });

  it("still rejects a different word", () => {
    expect(includesFolded("Bas khóa", "khoan")).toBe(false);
  });

  it("treats a missing value as empty", () => {
    expect(includesFolded(null, "a")).toBe(false);
    expect(includesFolded(undefined, "")).toBe(true);
  });
});

describe("foldSearchText", () => {
  it("keeps one character per input character", () => {
    expect(foldSearchText("Đơn hàng")).toBe("don hang");
  });
});
