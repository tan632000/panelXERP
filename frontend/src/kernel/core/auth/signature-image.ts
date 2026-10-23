import {
  canvasToBlob,
  createCanvas,
  toPixelRect,
} from "@/kernel/core/lib/image-canvas";

import type { NormalizedRect } from "@/kernel/core/lib/image-canvas";

/**
 * Turns a photo of a paper signature, or strokes drawn on screen, into the transparent PNG the
 * profile stores. Everything runs in the browser, so the server only ever receives the final
 * image and a raw phone photo never leaves the device.
 */

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface InkBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SignaturePen =
  "black" | "blue" | "navy" | "purple" | "red" | "green";

/** Pen colours offered for a signature — the inks documents are commonly signed in. */
export const SIGNATURE_PEN_COLORS: Record<SignaturePen, string> = {
  black: "#111827",
  blue: "#1e40af",
  navy: "#0b1f5c",
  purple: "#5b21b6",
  red: "#b91c1c",
  green: "#166534",
};

/** A photographed signature keeps its own ink colour, or is repainted in a `#rrggbb` colour. */
export type SignatureInkTone = "original" | string;

export interface SignatureCleanup {
  /** 0–1. Higher keeps fainter strokes; lower drops faint marks such as ruled lines. */
  sensitivity: number;
  /** Drops long, thin, straight marks — ruled lines and paper edges. */
  removeLines: boolean;
  /** The part of the photo that holds the signature; the whole photo when absent. */
  crop?: NormalizedRect | null;
  tone: SignatureInkTone;
}

export interface SignaturePoint {
  x: number;
  y: number;
  /** 0–1. Only a pen reports a real value; mouse and touch strokes use the midpoint. */
  pressure: number;
}

export type SignatureStroke = SignaturePoint[];

/**
 * Below the floor a pixel is still paper (grain, shade); the floor moves with the sensitivity,
 * from 0.2 darker than the paper around it down to 0.06.
 */
const INK_FLOOR_LOW_SENSITIVITY = 0.2;
const INK_FLOOR_HIGH_SENSITIVITY = 0.06;

/** This much darker than the floor the pixel is solid ink. Between the two it fades. */
const INK_FADE_RANGE = 0.2;

const DEFAULT_SENSITIVITY = 0.5;

/** A mark this small, relative to the image, is a speck of dust or sensor noise. */
const SPECK_AREA_RATIO = 0.00002;
const SPECK_MIN_AREA = 6;

/** A ruled line: no thicker than this on average, in pixels… */
const LINE_MAX_THICKNESS = 4;
/** …at least this many times longer than its box is wide… */
const LINE_MIN_ELONGATION = 12;
/** …and spanning at least this share of the image along its own axis. */
const LINE_MIN_SPAN = 0.3;

/**
 * A mark touching the image's edge that fills this much of its own box is solid — the desk
 * or a shadow beyond the paper — where pen strokes, even a tightly cropped signature running
 * off the edge, are thin lines that fill only a small part of theirs.
 */
const EDGE_BLOB_MIN_FILL = 0.35;
const EDGE_BLOB_MIN_AREA_RATIO = 0.002;

/**
 * A dash of a dotted or dashed ruled line: a short mark no thicker than this, at least twice as
 * long as it is thick. Dashes whose centres sit within the row tolerance of each other form
 * one row; a row whose dashes together cover the line span is a ruled line.
 */
const DASH_MAX_THICKNESS = 6;
const DASH_MIN_ELONGATION = 2;
const DASH_ROW_TOLERANCE = 3;
const DASH_MIN_COUNT = 3;

/** The darkest share of the solid ink sets the ink's colour. */
const INK_PROFILE_SHARE = 0.25;

/** Ink this saturated is coloured — a blue ballpoint — and can be told apart from grey marks. */
const COLORED_INK_MIN_SATURATION = 0.28;

/** The share of solid ink that must be coloured before the pen is taken to be coloured. */
const COLORED_INK_MIN_SHARE = 0.15;

/** Against coloured ink, a pixel this grey is paper shade or a pencil/printed line, not ink… */
const INK_SATURATION_FLOOR = 0.1;
/** …and from this saturation on it fully counts. */
const INK_SATURATION_FULL = 0.25;

/** A hue this close to the ink's is the same ink; beyond the outer limit it is not. */
const INK_HUE_FULL_DEGREES = 40;
const INK_HUE_LIMIT_DEGREES = 75;

/** Below 1 it lifts partial coverage, so a stroke reads solid while its edge stays smooth. */
const INK_OPACITY_GAMMA = 0.6;

/** Alpha above which a pixel counts towards the cropped area. */
const INK_VISIBLE_ALPHA = 40;

/** Long edge of the stored PNG — sharp on an A4 print, well under the server limit. */
const MAX_OUTPUT_EDGE = 1200;

const CROP_PADDING = 8;

/** Base line width of a drawn stroke, in screen pixels. */
const STROKE_WIDTH = 2.6;

/** Drawn signatures are exported above screen resolution so they stay crisp in print. */
const DRAWN_EXPORT_SCALE = 2;

function luminance(data: Uint8ClampedArray, offset: number): number {
  return (
    0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]
  );
}

/**
 * Paper brightness at every pixel. A photo rarely lights the page evenly, so one white point
 * for the whole image would erase ink in the bright corner and keep the shadow in the dark one.
 * The brightest pixel of each block is its paper level — a block is too large for a pen stroke
 * to fill — and the block grid is smoothed and interpolated back up to pixel resolution.
 */
function estimatePaperLevels(image: RgbaImage): Float32Array {
  const { data, width, height } = image;
  const block = Math.max(8, Math.round(Math.max(width, height) / 24));
  const cols = Math.ceil(width / block);
  const rows = Math.ceil(height / block);

  const peaks = new Float32Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / block) * cols;
    for (let x = 0; x < width; x++) {
      const cell = row + Math.floor(x / block);
      const lum = luminance(data, (y * width + x) * 4);
      if (lum > peaks[cell]) peaks[cell] = lum;
    }
  }

  const grid = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
          sum += peaks[rr * cols + cc];
          count++;
        }
      }
      grid[r * cols + c] = sum / count;
    }
  }

  const levels = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(Math.max(y / block - 0.5, 0), rows - 1);
    const r0 = Math.floor(fy);
    const r1 = Math.min(r0 + 1, rows - 1);
    const ty = fy - r0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(Math.max(x / block - 0.5, 0), cols - 1);
      const c0 = Math.floor(fx);
      const c1 = Math.min(c0 + 1, cols - 1);
      const tx = fx - c0;
      const top = grid[r0 * cols + c0] * (1 - tx) + grid[r0 * cols + c1] * tx;
      const bottom =
        grid[r1 * cols + c0] * (1 - tx) + grid[r1 * cols + c1] * tx;
      levels[y * width + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return levels;
}

/**
 * Makes the paper transparent in place, keeping the ink's own colour. Each pixel is judged
 * against the paper around it rather than against pure white, and the edge of a stroke fades
 * instead of being cut, so it does not come out jagged.
 */
export function removePaperBackground(
  image: RgbaImage,
  sensitivity = DEFAULT_SENSITIVITY,
): void {
  const { data } = image;
  const paper = estimatePaperLevels(image);
  const floor =
    INK_FLOOR_LOW_SENSITIVITY -
    (INK_FLOOR_LOW_SENSITIVITY - INK_FLOOR_HIGH_SENSITIVITY) *
      Math.min(Math.max(sensitivity, 0), 1);

  for (let i = 0; i < paper.length; i++) {
    const offset = i * 4;
    const level = Math.max(paper[i], 1);
    const darkness = 1 - Math.min(luminance(data, offset) / level, 1);
    const ink = Math.min(Math.max((darkness - floor) / INK_FADE_RANGE, 0), 1);
    const alpha = Math.round(ink * 255);
    data[offset + 3] = alpha;
    // A clear pixel still carries the photo's colour noise, and PNG compresses that noise
    // regardless of alpha — a phone photo would come out several MB. Blanking it is invisible.
    if (alpha === 0) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
    }
  }
}

interface Dash {
  label: number;
  axis: "horizontal" | "vertical";
  /** Centre across the axis: the row of a horizontal dash, the column of a vertical one. */
  centre: number;
  length: number;
}

/**
 * The dashes that line up into a dotted or dashed ruled line. Each dash alone is too short to
 * read as a line, so they are grouped by row — chaining neighbours within the tolerance, which
 * also follows a slightly tilted line — and a row counts once its dashes cover the span.
 */
function dashedLineLabels(
  dashes: readonly Dash[],
  axis: Dash["axis"],
  extent: number,
): number[] {
  const sorted = dashes
    .filter((dash) => dash.axis === axis)
    .sort((a, b) => a.centre - b.centre);
  const labels: number[] = [];
  let row: Dash[] = [];

  const closeRow = () => {
    const covered = row.reduce((sum, dash) => sum + dash.length, 0);
    if (row.length >= DASH_MIN_COUNT && covered >= extent * LINE_MIN_SPAN) {
      labels.push(...row.map((dash) => dash.label));
    }
    row = [];
  };

  for (const dash of sorted) {
    const last = row[row.length - 1];
    if (last && dash.centre - last.centre > DASH_ROW_TOLERANCE) closeRow();
    row.push(dash);
  }
  closeRow();
  return labels;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Hue in degrees and saturation 0–1, as HSV defines them. */
function hueSaturation(
  r: number,
  g: number,
  b: number,
): { hue: number; saturation: number } {
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (max === 0 || chroma === 0) return { hue: 0, saturation: 0 };
  let hue: number;
  if (max === r) hue = ((g - b) / chroma + 6) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  return { hue: hue * 60, saturation: chroma / max };
}

/**
 * Average colour of the darkest solid ink — the pen's true colour, free of edge blending. When
 * a fair share of the solid ink is coloured, only that share is sampled: a dark grey ruled line
 * must not drag a blue pen's colour towards grey.
 */
function inkProfile(image: RgbaImage): [number, number, number] | null {
  const { data } = image;
  let solid = 0;
  let saturated = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 255) continue;
    solid++;
    const { saturation } = hueSaturation(
      data[offset],
      data[offset + 1],
      data[offset + 2],
    );
    if (saturation >= COLORED_INK_MIN_SATURATION) saturated++;
  }
  if (solid === 0) return null;

  const coloredOnly = saturated >= solid * COLORED_INK_MIN_SHARE;
  const sampled = (offset: number) =>
    data[offset + 3] === 255 &&
    (!coloredOnly ||
      hueSaturation(data[offset], data[offset + 1], data[offset + 2])
        .saturation >= COLORED_INK_MIN_SATURATION);

  const histogram = new Uint32Array(256);
  let total = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (!sampled(offset)) continue;
    histogram[Math.round(luminance(data, offset))]++;
    total++;
  }

  let threshold = 0;
  for (let seen = 0; threshold < 255; threshold++) {
    seen += histogram[threshold];
    if (seen >= total * INK_PROFILE_SHARE) break;
  }

  const sum = [0, 0, 0];
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    // Compared rounded, as the histogram counted it; the raw value can sit just above the
    // threshold bucket and leave nothing sampled.
    if (!sampled(offset) || Math.round(luminance(data, offset)) > threshold) {
      continue;
    }
    sum[0] += data[offset];
    sum[1] += data[offset + 1];
    sum[2] += data[offset + 2];
    count++;
  }
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

/**
 * Cleans the ink the way a document scanner does. With coloured ink, anything grey or of
 * another hue — ruled lines, pencil, paper shade — is dropped even where it crosses a stroke,
 * since brightness alone cannot tell a dark grey line from the pen. Then every stroke is
 * repainted in one flat colour and made more opaque, so it reads crisp instead of carrying the
 * photo's noise and mottled shading.
 */
export function refineInk(
  image: RgbaImage,
  { tone }: { tone: SignatureInkTone },
): void {
  const { data } = image;
  const profile = inkProfile(image);
  if (!profile) return;

  const ink = hueSaturation(...profile);
  const colored = ink.saturation >= COLORED_INK_MIN_SATURATION;
  const [red, green, blue] =
    tone === "original" ? profile.map(Math.round) : hexToRgb(tone);

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;

    let coverage = data[offset + 3] / 255;
    if (colored) {
      const pixel = hueSaturation(
        data[offset],
        data[offset + 1],
        data[offset + 2],
      );
      const saturationWeight = Math.min(
        Math.max(
          (pixel.saturation - INK_SATURATION_FLOOR) /
            (INK_SATURATION_FULL - INK_SATURATION_FLOOR),
          0,
        ),
        1,
      );
      const hueGap = Math.abs(((pixel.hue - ink.hue + 540) % 360) - 180);
      const hueWeight = Math.min(
        Math.max(
          (INK_HUE_LIMIT_DEGREES - hueGap) /
            (INK_HUE_LIMIT_DEGREES - INK_HUE_FULL_DEGREES),
          0,
        ),
        1,
      );
      coverage *= saturationWeight * hueWeight;
    }

    const alpha = Math.round(coverage ** INK_OPACITY_GAMMA * 255);
    if (alpha === 0) {
      clearPixel(data, offset / 4);
      continue;
    }
    data[offset] = red;
    data[offset + 1] = green;
    data[offset + 2] = blue;
    data[offset + 3] = alpha;
  }
}

function clearPixel(data: Uint8ClampedArray, pixel: number): void {
  data.fill(0, pixel * 4, pixel * 4 + 4);
}

/**
 * Erases what survives background removal without being part of the signature: specks, and —
 * when asked — ruled lines, which read as long thin straight marks, solid or broken into a
 * row of dashes, and the desk or shadow beyond the paper, a solid mass at the image's edge. A mark
 * the signature touches is one connected shape with it and is kept whole, so a line is only
 * dropped where it runs clear of the strokes.
 */
export function removeStrayMarks(
  image: RgbaImage,
  { removeLines }: { removeLines: boolean },
): void {
  const { data, width, height } = image;
  const total = width * height;
  const labels = new Int32Array(total);
  const stack = new Int32Array(total);
  const dropped = [false];
  const dashes: Dash[] = [];
  const minArea = Math.max(
    SPECK_MIN_AREA,
    Math.round(total * SPECK_AREA_RATIO),
  );

  for (let start = 0; start < total; start++) {
    if (labels[start] !== 0 || data[start * 4 + 3] <= INK_VISIBLE_ALPHA) {
      continue;
    }
    const label = dropped.length;
    labels[start] = label;
    stack[0] = start;
    let top = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (top > 0) {
      const pixel = stack[--top];
      const x = pixel % width;
      const y = (pixel - x) / width;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (labels[next] !== 0 || data[next * 4 + 3] <= INK_VISIBLE_ALPHA) {
            continue;
          }
          labels[next] = label;
          stack[top++] = next;
        }
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const length = Math.max(boxWidth, boxHeight);
    const span = length / (boxWidth >= boxHeight ? width : height);
    const isLine =
      removeLines &&
      area / length <= LINE_MAX_THICKNESS &&
      length / Math.min(boxWidth, boxHeight) >= LINE_MIN_ELONGATION &&
      span >= LINE_MIN_SPAN;
    const touchesEdge =
      minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;
    const isEdgeBlob =
      removeLines &&
      touchesEdge &&
      area >= total * EDGE_BLOB_MIN_AREA_RATIO &&
      area / (boxWidth * boxHeight) >= EDGE_BLOB_MIN_FILL;
    dropped.push(area < minArea || isLine || isEdgeBlob);

    if (removeLines && !dropped[label]) {
      if (
        boxHeight <= DASH_MAX_THICKNESS &&
        boxWidth >= boxHeight * DASH_MIN_ELONGATION
      ) {
        dashes.push({
          label,
          axis: "horizontal",
          centre: (minY + maxY) / 2,
          length: boxWidth,
        });
      } else if (
        boxWidth <= DASH_MAX_THICKNESS &&
        boxHeight >= boxWidth * DASH_MIN_ELONGATION
      ) {
        dashes.push({
          label,
          axis: "vertical",
          centre: (minX + maxX) / 2,
          length: boxHeight,
        });
      }
    }
  }

  if (removeLines) {
    for (const label of dashedLineLabels(dashes, "horizontal", width)) {
      dropped[label] = true;
    }
    for (const label of dashedLineLabels(dashes, "vertical", height)) {
      dropped[label] = true;
    }
  }

  // The faint fringe below the visibility threshold belongs to whichever mark it borders; it
  // goes with a dropped mark, or it would leave a ghost of the line behind.
  for (let pixel = 0; pixel < total; pixel++) {
    const label = labels[pixel];
    if (label !== 0) {
      if (dropped[label]) clearPixel(data, pixel);
      continue;
    }
    if (data[pixel * 4 + 3] === 0) continue;
    const x = pixel % width;
    const y = (pixel - x) / width;
    let keep = false;
    for (let dy = -1; dy <= 1 && !keep; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const neighbour = labels[ny * width + nx];
        if (neighbour !== 0 && !dropped[neighbour]) {
          keep = true;
          break;
        }
      }
    }
    if (!keep) clearPixel(data, pixel);
  }
}

/** The smallest box around the visible ink, padded; null when the image holds none. */
export function findInkBounds(
  image: RgbaImage,
  padding = CROP_PADDING,
): InkBounds | null {
  const { data, width, height } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= INK_VISIBLE_ALPHA) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;

  const x = Math.max(minX - padding, 0);
  const y = Math.max(minY - padding, 0);
  return {
    x,
    y,
    width: Math.min(maxX + padding + 1, width) - x,
    height: Math.min(maxY + padding + 1, height) - y,
  };
}

function cropToPng(
  source: HTMLCanvasElement,
  bounds: InkBounds,
): Promise<Blob> {
  const scale = Math.min(
    1,
    MAX_OUTPUT_EDGE / Math.max(bounds.width, bounds.height),
  );
  const output = createCanvas(bounds.width * scale, bounds.height * scale);
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    output.width,
    output.height,
  );
  return canvasToBlob(output, "image/png");
}

/**
 * Lifts the signature out of a prepared photo: the chosen region only, paper made transparent,
 * the ink cleaned and repainted, stray marks erased, cropped to the ink. Resolves null when nothing reads as ink.
 */
export async function extractSignature(
  source: HTMLCanvasElement,
  { sensitivity, removeLines, crop, tone }: SignatureCleanup,
): Promise<Blob | null> {
  const { x, y, width, height } = toPixelRect(
    crop ?? { x: 0, y: 0, width: 1, height: 1 },
    source.width,
    source.height,
  );

  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  const image = ctx.getImageData(x, y, width, height);
  removePaperBackground(image, sensitivity);
  refineInk(image, { tone });
  removeStrayMarks(image, { removeLines });
  const bounds = findInkBounds(image);
  if (!bounds) return null;

  const work = createCanvas(width, height);
  work.getContext("2d")?.putImageData(image, 0, 0);
  return cropToPng(work, bounds);
}

function strokeWidth(pressure: number): number {
  return STROKE_WIDTH * (0.6 + pressure * 0.8);
}

function midpoint(a: SignaturePoint, b: SignaturePoint): SignaturePoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    pressure: (a.pressure + b.pressure) / 2,
  };
}

/**
 * Paints strokes as curves through the midpoints of the sampled points, which smooths the
 * corners a mouse or a finger leaves between samples. Coordinates are screen pixels; the
 * caller sets the transform for the target resolution.
 */
export function paintSignatureStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly SignatureStroke[],
  color: string,
): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  for (const points of strokes) {
    if (points.length === 0) continue;
    if (points.length === 1) {
      const [dot] = points;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, strokeWidth(dot.pressure) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    let from = points[0];
    for (let i = 1; i < points.length; i++) {
      const control = points[i - 1];
      const to =
        i === points.length - 1 ? points[i] : midpoint(control, points[i]);
      ctx.beginPath();
      ctx.lineWidth = strokeWidth((control.pressure + points[i].pressure) / 2);
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
      ctx.stroke();
      from = to;
    }
  }
}

/** The drawn signature as a transparent PNG cropped to the strokes. */
export function exportSignatureStrokes(
  strokes: readonly SignatureStroke[],
  color: string,
): Promise<Blob> {
  const points = strokes.flat();
  const margin = strokeWidth(1) + CROP_PADDING;
  const minX = Math.min(...points.map((p) => p.x)) - margin;
  const minY = Math.min(...points.map((p) => p.y)) - margin;
  const maxX = Math.max(...points.map((p) => p.x)) + margin;
  const maxY = Math.max(...points.map((p) => p.y)) + margin;

  const width = maxX - minX;
  const height = maxY - minY;
  const scale = Math.min(
    DRAWN_EXPORT_SCALE,
    MAX_OUTPUT_EDGE / Math.max(width, height),
  );
  const canvas = createCanvas(width * scale, height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
  paintSignatureStrokes(ctx, strokes, color);
  return canvasToBlob(canvas, "image/png");
}
