import { describe, expect, it } from "vitest";

import {
  NO_BROWSER_HEADER_FOOTER_CSS,
  buildPageCss,
} from "@/kernel/core/lib/print/page-css";

describe("buildPageCss", () => {
  it("forces a zero margin with no size", () => {
    expect(buildPageCss()).toBe("@page{margin:0}");
    expect(buildPageCss()).toBe(NO_BROWSER_HEADER_FOOTER_CSS);
  });

  it("includes the given size, still with a zero margin", () => {
    expect(buildPageCss({ size: "A4 landscape" })).toBe(
      "@page{size:A4 landscape;margin:0}",
    );
    expect(buildPageCss({ size: "70mm 80mm" })).toBe(
      "@page{size:70mm 80mm;margin:0}",
    );
  });
});
