import { describe, expect, it } from "vitest";

import { buildPrintDocument } from "@/kernel/core/lib/print/document";

describe("buildPrintDocument", () => {
  it("escapes the title and defaults to the document font with a 12mm margin", () => {
    const html = buildPrintDocument({
      title: `<Quote> & "Co"`,
      body: "<p>Hello</p>",
    });

    expect(html).toContain("<title>&lt;Quote&gt; &amp; &quot;Co&quot;</title>");
    expect(html).toContain('font-family:"Times New Roman",Times,serif');
    expect(html).toContain("padding:12mm");
    expect(html).toContain("font-size:12px;color:#111;");
    expect(html).toContain("<p>Hello</p>");
  });

  it("keeps Times New Roman for a stamp, with a 0 default margin", () => {
    const html = buildPrintDocument({
      title: "Tag",
      body: "<div>Tag</div>",
      font: "stamp",
    });

    expect(html).toContain('font-family:"Times New Roman",Times,serif');
    expect(html).not.toContain("Arial");
    expect(html).toContain("padding:0mm");
  });

  it("forces a zero @page margin so the browser print header/footer never shows", () => {
    expect(buildPrintDocument({ title: "T", body: "" })).toContain(
      "@page{margin:0}",
    );
    expect(
      buildPrintDocument({ title: "T", body: "", pageSize: "A4 landscape" }),
    ).toContain("@page{size:A4 landscape;margin:0}");
  });

  it("keeps the form code as the <title> only, never drawn on the printed page", () => {
    const html = buildPrintDocument({ title: "Form_IQC_00", body: "<p>x</p>" });
    expect(html).toContain("<title>Form_IQC_00</title>");
    expect(html).toContain("<body><p>x</p>");
    expect(html).not.toContain("hp-doccode");
  });

  it("lets the caller override the margin in mm", () => {
    expect(
      buildPrintDocument({ title: "T", body: "", pageMarginMm: 20 }),
    ).toContain("padding:20mm");
  });

  it("auto-prints onload by default", () => {
    const html = buildPrintDocument({ title: "T", body: "" });
    expect(html).toContain("window.onload=()=>{window.print();}");
  });

  it("delays the print when autoPrint carries a delay", () => {
    const html = buildPrintDocument({
      title: "T",
      body: "",
      autoPrint: { delayMs: 300 },
    });
    expect(html).toContain(
      "window.onload=()=>{setTimeout(()=>window.print(),300);}",
    );
  });

  it("omits the auto-print script entirely when autoPrint is false", () => {
    const html = buildPrintDocument({ title: "T", body: "", autoPrint: false });
    expect(html).not.toContain("window.print()");
  });

  it("merges printOnlyCss into its own @media print block", () => {
    const html = buildPrintDocument({
      title: "T",
      body: "",
      printOnlyCss: ".bar{display:none}",
    });
    expect(html).toContain("@media print{.bar{display:none}}");
  });
});
