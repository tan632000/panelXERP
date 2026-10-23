import { describe, expect, it } from "vitest";

import {
  SIGNATURE_PEN_COLORS,
  findInkBounds,
  refineInk,
  removePaperBackground,
  removeStrayMarks,
} from "@/kernel/core/auth/signature-image";

import type { RgbaImage } from "@/kernel/core/auth/signature-image";

function grayImage(
  width: number,
  height: number,
  shade: (x: number, y: number) => number,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const value = shade(x, y);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

function alphaAt(image: RgbaImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3];
}

describe("removePaperBackground", () => {
  it("clears the paper and keeps the ink opaque", () => {
    const image = grayImage(64, 32, (x, y) =>
      y === 16 && x >= 10 && x < 50 ? 30 : 235,
    );

    removePaperBackground(image);

    expect(alphaAt(image, 30, 16)).toBe(255);
    expect(alphaAt(image, 30, 4)).toBe(0);
    expect(alphaAt(image, 2, 28)).toBe(0);
    // Cleared paper is blanked too, or its photo noise would bloat the PNG.
    const paper = (4 * 64 + 30) * 4;
    expect(Array.from(image.data.slice(paper, paper + 4))).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("judges ink against the paper around it, so a shadowed page still clears", () => {
    // The left half of the page sits in shadow: its paper is darker than the lit half's ink
    // threshold would allow, yet it must come out transparent all the same.
    const image = grayImage(96, 48, (x, y) => {
      const paper = x < 48 ? 150 : 240;
      const onStroke = y === 24 && x >= 8 && x < 88;
      return onStroke ? Math.round(paper * 0.2) : paper;
    });

    removePaperBackground(image);

    expect(alphaAt(image, 20, 8)).toBe(0);
    expect(alphaAt(image, 80, 8)).toBe(0);
    expect(alphaAt(image, 20, 24)).toBe(255);
    expect(alphaAt(image, 80, 24)).toBe(255);
  });

  it("keeps the colour of blue ink", () => {
    const image = grayImage(32, 32, () => 240);
    const offset = (16 * 32 + 16) * 4;
    image.data.set([20, 40, 160, 255], offset);

    removePaperBackground(image);

    expect(Array.from(image.data.slice(offset, offset + 4))).toEqual([
      20, 40, 160, 255,
    ]);
  });
});

describe("findInkBounds", () => {
  it("crops to the ink with padding, clamped to the image", () => {
    const image = grayImage(64, 32, (x, y) =>
      y >= 10 && y < 14 && x >= 2 && x < 40 ? 30 : 235,
    );
    removePaperBackground(image);

    expect(findInkBounds(image, 4)).toEqual({
      x: 0,
      y: 6,
      width: 44,
      height: 12,
    });
  });

  it("reports no ink on a blank page", () => {
    const image = grayImage(32, 32, () => 235);
    removePaperBackground(image);

    expect(findInkBounds(image)).toBeNull();
  });
});

describe("removePaperBackground sensitivity", () => {
  it("drops a faint mark at low sensitivity and keeps it at high", () => {
    // A pale ruled line, about 17% darker than the paper.
    const make = () => grayImage(64, 32, (x, y) => (y === 16 ? 200 : 240));

    const low = make();
    removePaperBackground(low, 0);
    expect(alphaAt(low, 30, 16)).toBe(0);

    const high = make();
    removePaperBackground(high, 1);
    expect(alphaAt(high, 30, 16)).toBeGreaterThan(0);
  });
});

describe("removeStrayMarks", () => {
  // A 120×60 page: a ruled line across the top, a speck, and a solid signature blob.
  const page = () => {
    const image = grayImage(120, 60, (x, y) => {
      if (y === 6) return 40;
      if (x === 110 && y === 50) return 30;
      if (x >= 40 && x < 70 && y >= 30 && y < 45) return 30;
      return 240;
    });
    removePaperBackground(image);
    return image;
  };

  it("erases ruled lines and specks but keeps the signature", () => {
    const image = page();

    removeStrayMarks(image, { removeLines: true });

    expect(alphaAt(image, 60, 6)).toBe(0);
    expect(alphaAt(image, 110, 50)).toBe(0);
    expect(alphaAt(image, 55, 38)).toBe(255);
    expect(findInkBounds(image, 0)).toEqual({
      x: 40,
      y: 30,
      width: 30,
      height: 15,
    });
  });

  it("keeps ruled lines when line removal is off", () => {
    const image = page();

    removeStrayMarks(image, { removeLines: false });

    expect(alphaAt(image, 60, 6)).toBe(255);
    expect(alphaAt(image, 110, 50)).toBe(0);
  });

  it("erases a dashed ruled line, dash by dash, even slightly tilted", () => {
    // Dashes 8px long with 6px gaps, drifting one row down every 40px, beside a signature.
    const image = grayImage(160, 60, (x, y) => {
      const lineRow = 8 + Math.floor(x / 40);
      if (y === lineRow && x % 14 < 8) return 50;
      if (x >= 50 && x < 90 && y >= 30 && y < 48) return 30;
      return 240;
    });
    removePaperBackground(image);

    removeStrayMarks(image, { removeLines: true });

    expect(alphaAt(image, 2, 8)).toBe(0);
    expect(alphaAt(image, 143, 11)).toBe(0);
    expect(alphaAt(image, 70, 40)).toBe(255);
    expect(findInkBounds(image, 0)).toEqual({
      x: 50,
      y: 30,
      width: 40,
      height: 18,
    });
  });
});

describe("refineInk", () => {
  // Blue ballpoint strokes (rows 20–27) crossed by a dark grey ruled line on row 24.
  const bluePage = () => {
    const image = grayImage(80, 40, () => 240);
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 80; x++) {
        const offset = (y * 80 + x) * 4;
        if (x >= 20 && x < 60 && y >= 20 && y < 28 && y !== 24) {
          image.data.set([40, 55, 150, 255], offset);
        } else if (y === 24) {
          image.data.set([90, 90, 90, 255], offset);
        }
      }
    }
    removePaperBackground(image);
    return image;
  };

  it("drops grey marks against coloured ink and repaints the strokes one flat colour", () => {
    const image = bluePage();

    refineInk(image, { tone: "original" });

    // The grey line is gone, beside the strokes and where it crosses them.
    expect(alphaAt(image, 5, 24)).toBe(0);
    expect(alphaAt(image, 40, 24)).toBe(0);
    const stroke = (22 * 80 + 40) * 4;
    expect(Array.from(image.data.slice(stroke, stroke + 4))).toEqual([
      40, 55, 150, 255,
    ]);
  });

  it("repaints in the chosen standard ink", () => {
    const image = bluePage();

    refineInk(image, { tone: SIGNATURE_PEN_COLORS.black });

    const stroke = (22 * 80 + 40) * 4;
    expect(Array.from(image.data.slice(stroke, stroke + 4))).toEqual([
      17, 24, 39, 255,
    ]);
  });

  it("keeps grey marks when the ink itself is black, leaving them to the line filter", () => {
    const image = grayImage(80, 40, (x, y) =>
      y === 24 || (x >= 20 && x < 60 && y >= 20 && y < 28) ? 30 : 240,
    );
    removePaperBackground(image);

    refineInk(image, { tone: "original" });

    expect(alphaAt(image, 5, 24)).toBe(255);
  });
});

describe("removeStrayMarks edge masses", () => {
  it("drops a solid dark corner beyond the paper but keeps a stroke running off the edge", () => {
    const image = grayImage(120, 60, (x, y) => {
      // The desk showing in the top-right corner.
      if (x >= 100 && y < 12) return 20;
      // A thin stroke cropped tightly, running off the left edge.
      if (y === 40 && x < 50) return 30;
      if (x === 49 && y >= 30 && y <= 40) return 30;
      return 240;
    });
    removePaperBackground(image);

    removeStrayMarks(image, { removeLines: true });

    expect(alphaAt(image, 110, 5)).toBe(0);
    expect(alphaAt(image, 10, 40)).toBe(255);
  });
});
