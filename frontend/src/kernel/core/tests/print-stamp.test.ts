import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildStampPrintHtml,
  drawStampCanvas,
  runStampDownload,
  STAMP_INFO_MAX_LINES,
  STAMP_MIN_SCALE,
  stampPageCss,
  stampToolbarHtml,
} from "@/kernel/core/lib/print/stamp";

/** A 2D context that measures every character as `charWidth` and records what is drawn. */
function fakeContext(charWidth: number) {
  const drawn: Array<{ text: string; size: number }> = [];
  const context = {
    font: "",
    fillStyle: "",
    textAlign: "",
    textBaseline: "",
    imageSmoothingEnabled: true,
    measureText: (text: string) => ({ width: text.length * charWidth }),
    fillText(text: string) {
      drawn.push({ text, size: parseFloat(this.font.replace("bold ", "")) });
    },
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return drawn;
}

const LETTERHEAD = { companyName: "C", companyAddress: "A", madeIn: "M" };

function draw(value: string, rows = 1) {
  return drawStampCanvas({
    infoRows: Array.from({ length: rows }, () => ({
      label: "Tên TP",
      value,
      mode: "wrap" as const,
    })),
    bottomRows: [{ label: "Số lượng", value: "10 pcs", big: true }],
    letterhead: LETTERHEAD,
    logo: null,
    qr: null,
    dpi: 96,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("stamp page CSS and script", () => {
  it("wraps a long value in full instead of clipping it to two lines", () => {
    const css = stampPageCss(true);

    expect(css).toContain("overflow-wrap:anywhere");
    expect(css).not.toContain("line-clamp");
  });

  it("auto-shrinks the printed stamp down to 65% in 0.03 steps", () => {
    const html = buildStampPrintHtml({
      title: "t",
      stampsBody: "",
      multiPage: true,
      toolbar: {
        printLabel: "p",
        downloadPdfLabel: "d",
        downloadPngLabel: "n",
        note: "x",
      },
      escapeHtml: (value) => value,
    });

    expect(STAMP_MIN_SCALE).toBe(0.65);
    expect(html).toContain("k>0.65");
    expect(html).toContain("k-0.03");
  });
});

describe("drawStampCanvas", () => {
  it("prints a long value on up to eight lines, without an ellipsis", () => {
    const drawn = fakeContext(8);
    // 7 lines' worth of text at the stamp's value column width.
    draw("X".repeat(150));

    const valueLines = drawn.filter((line) => /^X+$/.test(line.text));
    expect(valueLines.length).toBeGreaterThan(2);
    expect(valueLines.length).toBeLessThanOrEqual(STAMP_INFO_MAX_LINES);
    expect(valueLines.map((line) => line.text).join("")).toBe("X".repeat(150));
    expect(drawn.some((line) => line.text.includes("…"))).toBe(false);
  });

  it("shrinks every size below the original once the text does not fit, stopping at the 0.65 step", () => {
    const short = fakeContext(2);
    draw("Short");
    const shortSize = short.find((line) => line.text === "Short")?.size ?? 0;

    vi.restoreAllMocks();
    const long = fakeContext(8);
    draw("X".repeat(400), 4);
    const longLine = long.find((line) => /^X+$/.test(line.text));

    if (!longLine) throw new Error("no value line drawn");
    expect(longLine.size).toBeLessThan(shortSize);
    // The loop stops once k is at or under 0.65, so the last 0.03 step may land on 0.64.
    expect(longLine.size).toBeGreaterThanOrEqual(shortSize * 0.64 - 0.01);
  });
});

/**
 * A download renders many 600dpi stamps; a second click while it runs must not queue a second
 * batch (the old flow fired every queued save at once when the busy opener caught up).
 */
describe("runStampDownload", () => {
  const captions = {
    working: (done: number, total: number) => `${done}/${total}`,
    failed: "failed",
  };

  function mountToolbar() {
    document.body.innerHTML = stampToolbarHtml(
      {
        printLabel: "In tem",
        downloadPdfLabel: "PDF",
        downloadPngLabel: "PNG",
        note: "",
      },
      (value) => value,
    );
  }

  afterEach(() => {
    document.body.innerHTML = "";
    delete document.body.dataset.busy;
  });

  it("disables the buttons, ignores a second click and re-enables when done", async () => {
    mountToolbar();
    let release: () => void = () => undefined;
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const first = runStampDownload(window, captions, task);
    const pdf = document.getElementById("hp-stamp-pdf") as HTMLButtonElement;
    expect(pdf.disabled).toBe(true);

    await runStampDownload(window, captions, task);
    expect(task).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(pdf.disabled).toBe(false);
    expect(document.body.dataset.busy).toBeUndefined();
  });

  it("shows the progress, then the failure message when the task throws", async () => {
    mountToolbar();
    const status = () =>
      document.querySelector("#hp-stamp-status .txt")?.textContent;

    await runStampDownload(window, captions, async (progress) => {
      await progress(3, 10);
      expect(status()).toBe("3/10");
      throw new Error("boom");
    });

    expect(status()).toBe("failed");
    expect(document.getElementById("hp-stamp-status")?.className).toContain(
      "err",
    );
  });
});
