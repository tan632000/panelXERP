import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQrDecoder, drawVideoFrame } from "@/kernel/core/lib/qr-decoder";

const mocks = vi.hoisted(() => ({
  hints: undefined as Map<unknown, unknown> | undefined,
  decodeFromCanvas: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    constructor(hints?: Map<unknown, unknown>) {
      mocks.hints = hints;
    }
    decodeFromCanvas = mocks.decodeFromCanvas;
  },
}));

const canvas = {} as HTMLCanvasElement;

beforeEach(() => {
  mocks.hints = undefined;
  mocks.decodeFromCanvas.mockReset();
});

afterEach(() => {
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe("createQrDecoder", () => {
  it("uses the browser's own detector when it reads QR codes", async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: "NATIVE" }]);
    const ctor = vi.fn();
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      static getSupportedFormats = () => Promise.resolve(["qr_code"]);
      constructor(options: unknown) {
        ctor(options);
      }
      detect = detect;
    };
    const decode = await createQrDecoder();
    await expect(decode(canvas)).resolves.toBe("NATIVE");
    expect(ctor).toHaveBeenCalledWith({ formats: ["qr_code"] });
    expect(mocks.decodeFromCanvas).not.toHaveBeenCalled();
  });

  it("falls back to zxing's thorough pass when no detector reads QR codes", async () => {
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      static getSupportedFormats = () => Promise.resolve(["ean_13"]);
    };
    mocks.decodeFromCanvas.mockReturnValueOnce({ getText: () => "ZXING" });
    const decode = await createQrDecoder();
    await expect(decode(canvas)).resolves.toBe("ZXING");
    expect([...(mocks.hints?.values() ?? [])]).toEqual([true]);
  });

  it("resolves null for a frame without a QR", async () => {
    mocks.decodeFromCanvas.mockImplementationOnce(() => {
      throw new Error("NotFoundException");
    });
    const decode = await createQrDecoder();
    await expect(decode(canvas)).resolves.toBeNull();
  });
});

describe("drawVideoFrame", () => {
  const drawImage = vi.fn();
  const target = () =>
    ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
    }) as unknown as HTMLCanvasElement;
  const video = (videoWidth: number, videoHeight: number) =>
    ({ videoWidth, videoHeight }) as HTMLVideoElement;

  beforeEach(() => drawImage.mockReset());

  it("crops the centred square of the shorter side", () => {
    const out = target();
    expect(drawVideoFrame(video(1920, 1080), out, 0.8)).toBe(true);
    expect([out.width, out.height]).toEqual([864, 864]);
    expect(drawImage.mock.calls[0].slice(1, 5)).toEqual([528, 108, 864, 864]);
  });

  it("draws the whole frame at fraction 1", () => {
    const out = target();
    drawVideoFrame(video(1280, 720), out, 1);
    expect([out.width, out.height]).toEqual([1280, 720]);
  });

  it("skips a video that has no frame yet", () => {
    expect(drawVideoFrame(video(0, 0), target(), 0.8)).toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
  });
});
