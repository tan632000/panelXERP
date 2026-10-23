import { describe, expect, it } from "vitest";

import { buildSignBlock } from "@/kernel/core/lib/print/sign-block";

describe("buildSignBlock", () => {
  it("prints a blank signing line per signer when none are signed", () => {
    const html = buildSignBlock(
      [
        { title: "Nhân viên QC", name: "Phạm Thị Lan" },
        { title: "Trưởng bộ phận QC", name: null },
      ],
      { signedLabel: "(Đã ký điện tử)" },
    );

    expect(html).toContain("grid-template-columns:repeat(2,1fr)");
    expect(html).toContain("Nhân viên QC");
    expect(html).toContain("border-top:1px solid #aaa");
    expect(html).toContain(">Phạm Thị Lan<");
    expect(html).not.toContain("Đã ký điện tử");
  });

  it("prints the signed note above the name for a signed signer only", () => {
    const html = buildSignBlock(
      [
        { title: "Nhân viên QC", name: "Phạm Thị Lan", signed: true },
        { title: "Trưởng bộ phận QC", name: "Nguyễn Văn Quang" },
      ],
      { signedLabel: "(Đã ký điện tử)" },
    );

    expect(html).toContain("(Đã ký điện tử)");
    expect((html.match(/\(Đã ký điện tử\)/g) ?? []).length).toBe(1);
    expect(html).toContain("border-top:1px solid #aaa");
  });

  it("uses the blank placeholder when an unsigned box has no name", () => {
    const html = buildSignBlock([{ title: "Người ký" }], {
      signedLabel: "(Đã ký điện tử)",
      blankPlaceholder: "Ký, ghi rõ họ tên",
    });

    expect(html).toContain("Ký, ghi rõ họ tên");
  });

  it("reserves leading blank columns for the single-signer Lab variant", () => {
    const html = buildSignBlock([{ title: "Bộ phận Lab", name: "Hoa" }], {
      signedLabel: "(Đã ký điện tử)",
      leadingBlankColumns: 1,
    });

    expect(html).toContain("grid-template-columns:repeat(2,1fr)");
    expect(html).toContain("<div></div>");
  });

  it("escapes names and titles", () => {
    const html = buildSignBlock([{ title: "A & B", name: "<X>" }], {
      signedLabel: "signed",
    });

    expect(html).toContain("A &amp; B");
    expect(html).toContain("&lt;X&gt;");
  });

  it("stamps the signer's e-signature image instead of the note, like the quotation", () => {
    const html = buildSignBlock(
      [
        {
          title: "Nhân viên QC",
          name: "An",
          signed: true,
          signatureImageUrl: "https://cdn/sig.png",
        },
        { title: "Trưởng bộ phận QC", name: "Binh", signed: true },
      ],
      { signedLabel: "(Đã ký điện tử)" },
    );
    expect(html).toContain('<img src="https://cdn/sig.png"');
    expect(html.match(/\(Đã ký điện tử\)/g)).toHaveLength(1);
  });
});
