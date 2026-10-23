import { describe, expect, it } from "vitest";

import { isAllowedFile, validateSingleFile } from "@/kernel/core/lib/files";

/** The shape a feature declares its attachment allowlist in: dotted, lower-case extensions. */
const DOCUMENT_ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg"] as const;

function fileNamed(name: string, size = 1024): File {
  return new File(["x".repeat(size)], name, { type: "application/pdf" });
}

describe("attachment allowlists use dotted extensions", () => {
  it("accepts a PDF whatever the case of its extension", () => {
    const pdf = fileNamed("ban-ve-tu-dien.PDF");
    expect(isAllowedFile(pdf, DOCUMENT_ALLOWED_EXTENSIONS)).toBe(true);
    expect(
      validateSingleFile(pdf, {
        allowedExtensions: DOCUMENT_ALLOWED_EXTENSIONS,
        maxBytes: 20 * 1024 * 1024,
      }),
    ).toBeNull();
  });

  it("accepts a lower-case extension with the same helper", () => {
    expect(
      isAllowedFile(fileNamed("drawing.pdf"), DOCUMENT_ALLOWED_EXTENSIONS),
    ).toBe(true);
  });

  it("still rejects unsupported formats", () => {
    const exe = new File(["x"], "setup.exe", { type: "application/exe" });
    expect(isAllowedFile(exe, DOCUMENT_ALLOWED_EXTENSIONS)).toBe(false);
    expect(
      validateSingleFile(exe, {
        allowedExtensions: DOCUMENT_ALLOWED_EXTENSIONS,
        maxBytes: 20 * 1024 * 1024,
      }),
    ).toBe("format");
  });
});
