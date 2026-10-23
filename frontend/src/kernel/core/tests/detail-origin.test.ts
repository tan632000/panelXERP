import { describe, expect, it } from "vitest";

import {
  decodeDetailOrigin,
  encodeDetailOrigin,
  withDetailOrigin,
} from "@/kernel/core/lib/detail-origin";

const ORIGIN = {
  href: "/plans/mrp/12",
  label: "MRP-NVL-2026-003",
  icon: "clipboard-list",
};

describe("detail origin", () => {
  it("round-trips the record a detail screen was opened from", () => {
    const decoded = decodeDetailOrigin(encodeDetailOrigin(ORIGIN));

    expect(decoded).toEqual(ORIGIN);
  });

  it("appends the origin to a detail path, and leaves it alone without one", () => {
    expect(withDetailOrigin("/procurement/purchase-order/7", ORIGIN)).toBe(
      `/procurement/purchase-order/7?origin=${encodeDetailOrigin(ORIGIN)}`,
    );
    expect(withDetailOrigin("/procurement/purchase-order/7", null)).toBe(
      "/procurement/purchase-order/7",
    );
  });

  it("keeps an origin without an icon", () => {
    const bare = { href: "/procurement/purchase-request/3", label: "PR-1" };

    expect(decodeDetailOrigin(encodeDetailOrigin(bare))).toEqual(bare);
  });

  /**
   * A hand-edited `origin` must never carry the reader off-site or strand them: everything
   * below decodes to null so the breadcrumb falls back to the screen's own list.
   */
  it.each([
    ["nothing", null],
    ["empty", ""],
    ["not json", "%7Bnope"],
    ["a bare string", encodeURIComponent(JSON.stringify("/plans/mrp/12"))],
    ["no label", encodeURIComponent(JSON.stringify({ href: "/plans/mrp/12" }))],
    ["no href", encodeURIComponent(JSON.stringify({ label: "MRP-1" }))],
    [
      "an absolute url",
      encodeURIComponent(
        JSON.stringify({ href: "https://evil.example/x", label: "MRP-1" }),
      ),
    ],
    [
      "a protocol-relative url",
      encodeURIComponent(
        JSON.stringify({ href: "//evil.example/x", label: "MRP-1" }),
      ),
    ],
  ])("refuses %s", (_name, value) => {
    expect(decodeDetailOrigin(value)).toBeNull();
  });

  it("refuses to encode an off-site origin in the first place", () => {
    expect(
      encodeDetailOrigin({ href: "https://evil.example/x", label: "MRP-1" }),
    ).toBeUndefined();
  });
});
