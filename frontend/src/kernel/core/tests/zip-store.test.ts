import { describe, expect, it } from "vitest";

import { buildStoredZipBlob, crc32 } from "@/kernel/core/lib/zip-store";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });
});

describe("buildStoredZipBlob", () => {
  it("stores every entry once, readable from the central directory", async () => {
    const blob = buildStoredZipBlob([
      { name: "Tem_TP_A.png", data: bytes("first") },
      { name: "Tem_TP_B.png", data: bytes("second!") },
    ]);
    const view = new DataView(await blob.arrayBuffer());

    expect(blob.type).toBe("application/zip");
    expect(view.getUint32(0, true)).toBe(0x04034b50);

    const endOffset = view.byteLength - 22;
    expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(endOffset + 10, true)).toBe(2);

    // Walk the central directory: names, sizes and CRCs line up with the inputs.
    let cursor = view.getUint32(endOffset + 16, true);
    const names: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      expect(view.getUint32(cursor, true)).toBe(0x02014b50);
      const size = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const name = new TextDecoder().decode(
        new Uint8Array(view.buffer, cursor + 46, nameLength),
      );
      names.push(name);
      expect(size).toBe(name.endsWith("A.png") ? 5 : 7);
      expect(view.getUint32(cursor + 16, true)).toBe(
        crc32(bytes(name.endsWith("A.png") ? "first" : "second!")),
      );
      cursor += 46 + nameLength;
    }
    expect(names).toEqual(["Tem_TP_A.png", "Tem_TP_B.png"]);
  });
});
