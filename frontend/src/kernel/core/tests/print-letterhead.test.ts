import { describe, expect, it } from "vitest";

import { buildHpLetterhead } from "@/kernel/core/lib/print/letterhead";

const labels = {
  companyName: "PANELXERP DEMO COMPANY",
  companyAddress: "Số 1 Đường Demo, Hà Nội",
  contactLines: ["Tel: +84 24 0000 0000  MST: 0000000000"],
};

describe("buildHpLetterhead", () => {
  it("defaults to the canonical logo-left header with a divider", () => {
    const html = buildHpLetterhead(labels);

    expect(html).toContain("PANELXERP DEMO COMPANY");
    expect(html).toContain("Số 1 Đường Demo, Hà Nội");
    expect(html).toContain("Tel: +84 24 0000 0000  MST: 0000000000");
    expect(html).toContain("border-bottom:2px solid #333");
    expect(html).toContain("width:64px");
    // Logo comes before the text block.
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("<b "));
  });

  it("puts the text before the logo and drops the divider for logoRight", () => {
    const html = buildHpLetterhead(labels, { variant: "logoRight" });

    expect(html).not.toContain("border-bottom:2px solid #333");
    expect(html).toContain("width:70px");
    expect(html.indexOf("<b ")).toBeLessThan(html.indexOf("<img"));
  });

  it("escapes every label", () => {
    const html = buildHpLetterhead({
      companyName: "A & B",
      companyAddress: "<addr>",
      contactLines: ['"Tel"'],
    });

    expect(html).toContain("A &amp; B");
    expect(html).toContain("&lt;addr&gt;");
    expect(html).toContain("&quot;Tel&quot;");
  });

  it("prints one line per contact entry, in order", () => {
    const html = buildHpLetterhead({
      companyName: "C",
      companyAddress: "Addr",
      contactLines: ["Tax code", "Phone"],
    });

    expect(html.indexOf("Tax code")).toBeLessThan(html.indexOf("Phone"));
  });
});
