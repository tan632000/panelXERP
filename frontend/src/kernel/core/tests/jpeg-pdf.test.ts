import { describe, expect, it } from "vitest";

import {
  buildJpegPdfBlob,
  buildJpegPdfBytes,
  buildSinglePageJpegPdfBytes,
  jpegDataUrlToBinary,
} from "@/kernel/core/lib/jpeg-pdf";

describe("buildJpegPdfBytes / buildSinglePageJpegPdfBytes", () => {
  it("writes a %PDF-1.4 header and the MediaBox in pt for 70x80mm", () => {
    const bytes = buildSinglePageJpegPdfBytes(
      "fake-jpeg-bytes",
      1654,
      1890,
      70,
      80,
    );
    const text = Buffer.from(bytes).toString("latin1");

    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text).toContain("%%EOF");
    // 70mm and 80mm in pt (72/25.4), rounded to 2 decimals.
    expect(text).toContain("/MediaBox [0 0 198.43 226.77]");
    expect(text).toContain("/Width 1654");
    expect(text).toContain("/Height 1890");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Count 1");
  });

  it("writes the MediaBox in pt for 30x20mm", () => {
    const bytes = buildSinglePageJpegPdfBytes("x", 709, 472, 30, 20);
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("/MediaBox [0 0 85.04 56.69]");
  });

  it("numbers multiple pages sequentially, one object group per page", () => {
    const bytes = buildJpegPdfBytes(
      [
        { imageBinary: "a", widthPx: 10, heightPx: 10 },
        { imageBinary: "b", widthPx: 10, heightPx: 10 },
        { imageBinary: "c", widthPx: 10, heightPx: 10 },
      ],
      70,
      80,
    );
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("/Count 3");
    expect(text).toContain("/Kids [3 0 R 6 0 R 9 0 R]");
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(3);
  });
});

describe("buildJpegPdfBlob", () => {
  it("returns an application/pdf blob", () => {
    const blob = buildJpegPdfBlob(
      [{ imageBinary: "x", widthPx: 1, heightPx: 1 }],
      70,
      80,
    );
    expect(blob.type).toBe("application/pdf");
  });
});

describe("jpegDataUrlToBinary", () => {
  it("decodes the base64 payload of a data URL", () => {
    // "hi" base64-encoded.
    expect(jpegDataUrlToBinary("data:image/jpeg;base64,aGk=")).toBe("hi");
  });

  it("returns an empty string without a comma", () => {
    expect(jpegDataUrlToBinary("not-a-data-url")).toBe("");
  });
});
