/**
 * Browser-side image editing shared by the avatar and signature editors: decoding a photo into
 * a canvas, turning it, and the geometry of a crop frame dragged over it.
 */

/** A region of an image in 0–1 fractions of its width and height. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

/** The edges each crop handle drags: north, south, east, west, and the four corners. */
export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Phone photos are far larger than any editor here needs; working smaller keeps it fast. */
const MAX_EDIT_EDGE = 1600;

/** A frame thinner than this share of the image is a stray click, not a crop. */
export const MIN_CROP = 0.02;

export const FULL_FRAME: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas export failed")),
      type,
      quality,
    );
  });
}

/**
 * Decodes a photo into a working canvas: scaled down, and flattened onto white — a PNG that is
 * already partly transparent has black under its clear pixels.
 */
export async function loadImageForEditing(
  file: Blob,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_EDIT_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = createCanvas(bitmap.width * scale, bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** The image turned by any angle, on a canvas grown to hold it, the new corners white. */
export function rotateCanvas(
  source: HTMLCanvasElement,
  degrees: number,
): HTMLCanvasElement {
  const radians = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const canvas = createCanvas(
    source.width * cos + source.height * sin,
    source.width * sin + source.height * cos,
  );
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

/**
 * The image turned by a small angle and enlarged just enough to fill its own frame, the way a
 * phone's photo editor straightens a picture: no white corner ever shows, at the cost of a
 * little of the edges.
 */
export function straightenCanvas(
  source: HTMLCanvasElement,
  degrees: number,
): HTMLCanvasElement {
  if (degrees === 0) return source;
  const radians = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const { width, height } = source;
  const scale = Math.max(
    cos + (height / width) * sin,
    cos + (width / height) * sin,
  );
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.imageSmoothingQuality = "high";
  ctx.translate(width / 2, height / 2);
  ctx.rotate(radians);
  ctx.scale(scale, scale);
  ctx.drawImage(source, -width / 2, -height / 2);
  return canvas;
}

/** A normalized region in whole pixels of an image that size, never empty or out of bounds. */
export function toPixelRect(
  rect: NormalizedRect,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(Math.floor(rect.x * width), width - 1);
  const y = Math.min(Math.floor(rect.y * height), height - 1);
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(rect.width * width), width - x)),
    height: Math.max(1, Math.min(Math.round(rect.height * height), height - y)),
  };
}

/** A region of the image redrawn at the given output size. */
export function cropCanvas(
  source: HTMLCanvasElement,
  rect: NormalizedRect,
  outputWidth: number,
  outputHeight: number,
): HTMLCanvasElement {
  const region = toPixelRect(rect, source.width, source.height);
  const output = createCanvas(outputWidth, outputHeight);
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    output.width,
    output.height,
  );
  return output;
}

/**
 * The width a frame must have, in normalized units, per unit of normalized height to keep a
 * pixel aspect ratio on an image of this shape.
 */
function normalizedAspect(
  aspect: number,
  imageWidth: number,
  imageHeight: number,
): number {
  return (aspect * imageHeight) / imageWidth;
}

/** The largest frame of the given pixel aspect ratio, centred on the image. */
export function centeredFrame(
  aspect: number,
  imageWidth: number,
  imageHeight: number,
): NormalizedRect {
  const ratio = normalizedAspect(aspect, imageWidth, imageHeight);
  const width = Math.min(1, ratio);
  const height = width / ratio;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

export function rectBetween(
  a: NormalizedPoint,
  b: NormalizedPoint,
): NormalizedRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * A frame held to a pixel aspect ratio, grown from a fixed corner towards the pointer: the
 * pointer's farther axis sets the size, and the frame stops at the image's edges.
 */
export function lockedFrameFrom(
  anchor: NormalizedPoint,
  point: NormalizedPoint,
  aspect: number,
  imageWidth: number,
  imageHeight: number,
): NormalizedRect {
  const ratio = normalizedAspect(aspect, imageWidth, imageHeight);
  const towardsRight = point.x >= anchor.x;
  const towardsBottom = point.y >= anchor.y;
  const room = Math.min(
    towardsRight ? 1 - anchor.x : anchor.x,
    (towardsBottom ? 1 - anchor.y : anchor.y) * ratio,
  );
  const width = Math.min(
    Math.max(
      Math.abs(point.x - anchor.x),
      Math.abs(point.y - anchor.y) * ratio,
    ),
    room,
  );
  const height = width / ratio;
  return {
    x: towardsRight ? anchor.x : anchor.x - width,
    y: towardsBottom ? anchor.y : anchor.y - height,
    width,
    height,
  };
}

/** The frame with the dragged edges moved to the pointer, never thinner than a real crop. */
export function resizeFrame(
  frame: NormalizedRect,
  handle: CropHandle,
  point: NormalizedPoint,
): NormalizedRect {
  let left = frame.x;
  let top = frame.y;
  let right = frame.x + frame.width;
  let bottom = frame.y + frame.height;
  if (handle.includes("w")) left = Math.min(point.x, right - MIN_CROP);
  if (handle.includes("e")) right = Math.max(point.x, left + MIN_CROP);
  if (handle.includes("n")) top = Math.min(point.y, bottom - MIN_CROP);
  if (handle.includes("s")) bottom = Math.max(point.y, top + MIN_CROP);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The corner a corner handle pivots on: the one diagonally opposite it. */
export function oppositeCorner(
  frame: NormalizedRect,
  handle: CropHandle,
): NormalizedPoint {
  return {
    x: handle.includes("w") ? frame.x + frame.width : frame.x,
    y: handle.includes("n") ? frame.y + frame.height : frame.y,
  };
}

/** The frame shifted with the pointer, stopped at the image's edges. */
export function moveFrame(
  frame: NormalizedRect,
  start: NormalizedPoint,
  point: NormalizedPoint,
): NormalizedRect {
  return {
    ...frame,
    x: Math.min(Math.max(frame.x + point.x - start.x, 0), 1 - frame.width),
    y: Math.min(Math.max(frame.y + point.y - start.y, 0), 1 - frame.height),
  };
}

/** A frame that covers the whole image crops nothing. */
export function isFullFrame(frame: NormalizedRect): boolean {
  return (
    frame.x <= 0.001 &&
    frame.y <= 0.001 &&
    frame.width >= 0.999 &&
    frame.height >= 0.999
  );
}

/** The image mirrored left to right, as a front camera's selfie needs. */
export function mirrorCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/**
 * The frame at a zoom level, where 1 is the largest frame the image allows and 2 is half as
 * wide. The frame keeps its centre where it can, and slides back inside the image where not.
 */
export function zoomFrame(
  frame: NormalizedRect,
  largest: NormalizedRect,
  zoom: number,
): NormalizedRect {
  const width = largest.width / zoom;
  const height = largest.height / zoom;
  const centreX = frame.x + frame.width / 2;
  const centreY = frame.y + frame.height / 2;
  return {
    x: Math.min(Math.max(centreX - width / 2, 0), 1 - width),
    y: Math.min(Math.max(centreY - height / 2, 0), 1 - height),
    width,
    height,
  };
}

/** Each −100 to 100, where 0 leaves the image as it is. */
export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

export const NO_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

/**
 * Applies brightness, contrast and saturation in place. Done on the pixels rather than with a
 * canvas filter, which not every browser supports, and cheap at avatar size.
 */
export function adjustColors(
  data: Uint8ClampedArray,
  { brightness, contrast, saturation }: ImageAdjustments,
): void {
  if (brightness === 0 && contrast === 0 && saturation === 0) return;
  const lift = brightness * 2.55;
  const c = contrast * 2.55;
  const contrastFactor = (259 * (c + 255)) / (255 * (259 - c));
  const saturationFactor = 1 + saturation / 100;

  for (let offset = 0; offset < data.length; offset += 4) {
    let r = contrastFactor * (data[offset] + lift - 128) + 128;
    let g = contrastFactor * (data[offset + 1] + lift - 128) + 128;
    let b = contrastFactor * (data[offset + 2] + lift - 128) + 128;
    const grey = 0.299 * r + 0.587 * g + 0.114 * b;
    r = grey + (r - grey) * saturationFactor;
    g = grey + (g - grey) * saturationFactor;
    b = grey + (b - grey) * saturationFactor;
    // Uint8ClampedArray rounds and clamps to 0–255 on assignment.
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
  }
}

/** A cropped region at the given size with the colour adjustments applied. */
export function renderAdjustedCrop(
  source: HTMLCanvasElement,
  rect: NormalizedRect,
  size: number,
  adjustments: ImageAdjustments,
): HTMLCanvasElement {
  const output = cropCanvas(source, rect, size, size);
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  const image = ctx.getImageData(0, 0, output.width, output.height);
  adjustColors(image.data, adjustments);
  ctx.putImageData(image, 0, 0);
  return output;
}
