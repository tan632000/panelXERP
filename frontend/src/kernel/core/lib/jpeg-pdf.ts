/**
 * Self-built PDF writer embedding JPEG pages — no external library, porting the mock's
 * `_pdfFromJpegPages`. Used by every stamp/tag printer that offers a "download PDF" button
 * sized to its own physical label (70x80mm TEM TP, 30x20mm calibration tag, ...).
 */

export interface JpegPdfPage {
  /** Raw JPEG bytes as a binary string — one char per byte (`atob` output). */
  imageBinary: string;
  widthPx: number;
  heightPx: number;
}

/**
 * Builds a PDF with one page per entry in `pages`, each page a full-bleed JPEG sized exactly
 * `widthMm` x `heightMm` (every page of one stamp run shares the same physical size).
 */
export function buildJpegPdfBytes(
  pages: JpegPdfPage[],
  widthMm: number,
  heightMm: number,
): Uint8Array {
  const widthPt = (widthMm * (72 / 25.4)).toFixed(2);
  const heightPt = (heightMm * (72 / 25.4)).toFixed(2);
  const content = `q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im0 Do Q`;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((page, i) => {
    const pageObjNum = 3 + i * 3;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 ${pageObjNum + 1} 0 R >> >> /Contents ${pageObjNum + 2} 0 R >>`,
    );
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.imageBinary.length} >>\nstream\n${page.imageBinary}\nendstream`,
    );
    objects.push(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = out.length;
  const xrefEntries = offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefEntries}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i += 1) {
    bytes[i] = out.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** Single-page convenience wrapper over {@link buildJpegPdfBytes}. */
export function buildSinglePageJpegPdfBytes(
  imageBinary: string,
  widthPx: number,
  heightPx: number,
  widthMm: number,
  heightMm: number,
): Uint8Array {
  return buildJpegPdfBytes(
    [{ imageBinary, widthPx, heightPx }],
    widthMm,
    heightMm,
  );
}

/** A PDF `Blob` of the given JPEG pages, ready for {@link downloadBlob}. */
export function buildJpegPdfBlob(
  pages: JpegPdfPage[],
  widthMm: number,
  heightMm: number,
): Blob {
  const bytes = buildJpegPdfBytes(pages, widthMm, heightMm);
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** The raw JPEG binary string (`atob` output) behind a canvas's own `toDataURL("image/jpeg")`. */
export function jpegDataUrlToBinary(dataUrl: string): string {
  return atob(dataUrl.split(",")[1] ?? "");
}

/**
 * Loads an `<img>` from a URL (a static asset, or a data URL such as a freshly generated QR
 * code) for compositing onto a canvas — the image loader the mock's `_loadImg` wraps.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}
