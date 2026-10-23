import { describe, expect, it } from "vitest";

import { escapeHtml, textOrDash } from "@/kernel/core/lib/print/html";

describe("escapeHtml", () => {
  it('escapes &, <, >, and " so the text cannot break out of a node or attribute', () => {
    expect(escapeHtml(`<b>"A" & B</b>`)).toBe(
      "&lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;",
    );
  });

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("Bracket FG_0001")).toBe("Bracket FG_0001");
  });
});

describe("textOrDash", () => {
  it("escapes a trimmed value", () => {
    expect(textOrDash(" Samsung <Vina> ")).toBe("Samsung &lt;Vina&gt;");
  });

  it("prints the default dash for a blank value", () => {
    expect(textOrDash(null)).toBe("—");
    expect(textOrDash(undefined)).toBe("—");
    expect(textOrDash("   ")).toBe("—");
  });

  it("prints a caller-given dash", () => {
    expect(textOrDash(null, "-")).toBe("-");
  });
});
