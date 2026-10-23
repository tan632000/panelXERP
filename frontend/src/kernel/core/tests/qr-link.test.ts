import { describe, expect, it } from "vitest";

import { resolveInAppQrPath } from "@/kernel/core/lib/qr-link";

const ORIGIN = "https://erp.example.com";

describe("resolveInAppQrPath", () => {
  it("returns the path and query of a same-origin receipt-line link", () => {
    expect(
      resolveInAppQrPath(
        "https://erp.example.com/warehouse/raw-material/by-no/NK-2026-0001?code=NVL01&line=2",
        ORIGIN,
      ),
    ).toBe("/warehouse/raw-material/by-no/NK-2026-0001?code=NVL01&line=2");
  });

  it("accepts a bare path and trims surrounding whitespace", () => {
    expect(resolveInAppQrPath("  /warehouse/xlbm/12?line=1 \n", ORIGIN)).toBe(
      "/warehouse/xlbm/12?line=1",
    );
  });

  it("drops a locale prefix so the router applies the reader's own", () => {
    expect(
      resolveInAppQrPath(
        "https://erp.example.com/en/warehouse/xlbm/12",
        ORIGIN,
      ),
    ).toBe("/warehouse/xlbm/12");
    expect(resolveInAppQrPath("/vi", ORIGIN)).toBe("/");
  });

  it("rejects links to another origin", () => {
    expect(
      resolveInAppQrPath("https://evil.example.com/warehouse/xlbm/12", ORIGIN),
    ).toBeNull();
    expect(resolveInAppQrPath("//evil.example.com/x", ORIGIN)).toBeNull();
    expect(
      resolveInAppQrPath("http://erp.example.com/warehouse/xlbm/12", ORIGIN),
    ).toBeNull();
  });

  it("rejects plain-text payloads and other schemes", () => {
    expect(
      resolveInAppQrPath("TEM-2026-0001|TP_0011|XLBM-2026-0001|200pcs", ORIGIN),
    ).toBeNull();
    expect(resolveInAppQrPath("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(resolveInAppQrPath("", ORIGIN)).toBeNull();
  });
});
