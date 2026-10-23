import { describe, expect, it } from "vitest";

import {
  adjustColors,
  centeredFrame,
  lockedFrameFrom,
  moveFrame,
  oppositeCorner,
  resizeFrame,
  toPixelRect,
  zoomFrame,
} from "@/kernel/core/lib/image-canvas";

import type {
  NormalizedPoint,
  NormalizedRect,
} from "@/kernel/core/lib/image-canvas";

/** Frame arithmetic is floating point; compare to a few decimals. */
function expectClose(
  actual: NormalizedRect | NormalizedPoint,
  expected: NormalizedRect | NormalizedPoint,
) {
  for (const [key, value] of Object.entries(expected)) {
    expect(actual[key as keyof typeof actual]).toBeCloseTo(value as number);
  }
}

describe("centeredFrame", () => {
  it("fits the largest centred square on a landscape image", () => {
    // 400×200: a square is half the width and the full height.
    expect(centeredFrame(1, 400, 200)).toEqual({
      x: 0.25,
      y: 0,
      width: 0.5,
      height: 1,
    });
  });

  it("fits the largest centred square on a portrait image", () => {
    expect(centeredFrame(1, 200, 400)).toEqual({
      x: 0,
      y: 0.25,
      width: 1,
      height: 0.5,
    });
  });
});

describe("lockedFrameFrom", () => {
  it("keeps a square in pixels while the pointer pulls unevenly", () => {
    const frame = lockedFrameFrom(
      { x: 0, y: 0 },
      { x: 0.3, y: 0.2 },
      1,
      400,
      200,
    );

    // The farther axis wins: 0.2 of the 200px height is 40px; 0.3 of 400px is 120px.
    expect(frame.width * 400).toBeCloseTo(120);
    expect(frame.height * 200).toBeCloseTo(120);
  });

  it("stops at the image's edges instead of stretching", () => {
    const frame = lockedFrameFrom(
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
      1,
      400,
      200,
    );

    expect(frame.y + frame.height).toBeCloseTo(1);
    expect(frame.width * 400).toBeCloseTo(frame.height * 200);
  });

  it("grows towards the pointer from the anchor, up and to the left too", () => {
    const frame = lockedFrameFrom(
      { x: 0.8, y: 0.8 },
      { x: 0.6, y: 0.2 },
      1,
      200,
      200,
    );

    expectClose(frame, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
  });
});

describe("frame editing", () => {
  const frame = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };

  it("pivots a corner on the corner opposite it", () => {
    expectClose(oppositeCorner(frame, "nw"), { x: 0.6, y: 0.6 });
    expectClose(oppositeCorner(frame, "se"), { x: 0.2, y: 0.2 });
  });

  it("moves only the dragged edge", () => {
    expectClose(resizeFrame(frame, "e", { x: 0.9, y: 0.5 }), {
      x: 0.2,
      y: 0.2,
      width: 0.7,
      height: 0.4,
    });
  });

  it("keeps a moved frame inside the image", () => {
    expectClose(moveFrame(frame, { x: 0.3, y: 0.3 }, { x: 0.9, y: 0.1 }), {
      ...frame,
      x: 0.6,
      y: 0,
    });
  });
});

describe("toPixelRect", () => {
  it("never reaches past the image", () => {
    expect(
      toPixelRect({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, 100, 50),
    ).toEqual({ x: 90, y: 45, width: 10, height: 5 });
  });
});

describe("zoomFrame", () => {
  const largest = { x: 0.25, y: 0, width: 0.5, height: 1 };

  it("halves the frame at 2× around its centre", () => {
    expectClose(zoomFrame(largest, largest, 2), {
      x: 0.375,
      y: 0.25,
      width: 0.25,
      height: 0.5,
    });
  });

  it("slides a frame near the edge back inside when zooming out", () => {
    const corner = { x: 0.75, y: 0.75, width: 0.25, height: 0.25 };

    expectClose(zoomFrame(corner, largest, 1), {
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 1,
    });
  });
});

describe("adjustColors", () => {
  const pixel = () => new Uint8ClampedArray([100, 150, 200, 255]);

  it("leaves the image alone with no adjustment", () => {
    const data = pixel();
    adjustColors(data, { brightness: 0, contrast: 0, saturation: 0 });
    expect(Array.from(data)).toEqual([100, 150, 200, 255]);
  });

  it("brightens every channel and keeps alpha", () => {
    const data = pixel();
    adjustColors(data, { brightness: 20, contrast: 0, saturation: 0 });
    expect(Array.from(data)).toEqual([151, 201, 251, 255]);
  });

  it("turns the image grey at the lowest saturation", () => {
    const data = pixel();
    adjustColors(data, { brightness: 0, contrast: 0, saturation: -100 });
    const [r, g, b] = Array.from(data);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});
