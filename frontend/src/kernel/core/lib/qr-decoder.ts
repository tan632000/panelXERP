import { BrowserQRCodeReader } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";

/** Reads one QR off a drawn frame; resolves `null` when the frame holds none. */
export type QrDecoder = (source: HTMLCanvasElement) => Promise<string | null>;

interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface NativeBarcodeDetectorClass {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** Largest side a picked photo is scaled down to; phone photos are far larger than a QR needs. */
const PHOTO_MAX_SIDE = 2000;

/**
 * The fastest QR reader this browser offers: the built-in `BarcodeDetector` (Chrome on Android,
 * desktop Chrome/Edge) when it reads QR codes, else zxing with its thorough pass, which also
 * finds a small or slightly blurred code that the quick pass misses.
 */
export async function createQrDecoder(): Promise<QrDecoder> {
  const Native = (
    globalThis as { BarcodeDetector?: NativeBarcodeDetectorClass }
  ).BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes("qr_code")) {
        const detector = new Native({ formats: ["qr_code"] });
        return async (source) => {
          try {
            const [first] = await detector.detect(source);
            return first?.rawValue || null;
          } catch {
            return null;
          }
        };
      }
    } catch {
      // A detector that cannot list its formats is treated as absent.
    }
  }

  const reader = new BrowserQRCodeReader(
    new Map([[DecodeHintType.TRY_HARDER, true]]),
  );
  return async (source) => {
    try {
      return reader.decodeFromCanvas(source).getText();
    } catch {
      // zxing reports a frame without a QR as an exception.
      return null;
    }
  };
}

/**
 * Draws the video onto `canvas` for one decode attempt: the centred square covering `fraction`
 * of the shorter side — where the scan window sits — or the whole frame at `fraction` 1. Cropping
 * keeps every camera pixel of the code while giving the reader far fewer pixels to search.
 * Returns false while the video has no frame yet.
 */
export function drawVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  fraction: number,
): boolean {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!width || !height || !context) return false;

  const cropWidth = fraction >= 1 ? width : Math.min(width, height) * fraction;
  const cropHeight =
    fraction >= 1 ? height : Math.min(width, height) * fraction;
  canvas.width = Math.round(cropWidth);
  canvas.height = Math.round(cropHeight);
  context.drawImage(
    video,
    (width - cropWidth) / 2,
    (height - cropHeight) / 2,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return true;
}

/** Reads the QR in a picked photo, or resolves `null` when it holds none or cannot be opened. */
export async function decodeQrImageFile(file: Blob): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(
    1,
    PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const decode = await createQrDecoder();
  return decode(canvas);
}
