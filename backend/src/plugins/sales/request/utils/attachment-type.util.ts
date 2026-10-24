import { openBoundedZip } from '@shared/services/excel-sheet.parser';

/**
 * What a request may carry: drawings, specs and photos. A file is accepted only when its
 * extension is on this list AND its leading bytes are those of that format — the extension is
 * the client's word, the bytes are the file's. The stored content type comes from here, never
 * from the `Content-Type` the client sent.
 */
export interface AttachmentType {
  contentType: string;
  /** Whether the file's bytes are really of this format. */
  matches: (bytes: Buffer) => boolean | Promise<boolean>;
}

function startsWith(bytes: Buffer, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((byte, index) => bytes[index] === byte)
  );
}

const ascii = (text: string): number[] =>
  [...text].map((char) => char.charCodeAt(0));

const PDF_SIGNATURE = ascii('%PDF-');
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
// AutoCAD binary drawings open with their release tag: AC1015, AC1018, AC1027, AC1032…
const DWG_SIGNATURE = ascii('AC10');

/**
 * An xlsx is a zip holding a workbook part, so the zip header alone would let any archive
 * through. The archive is opened with the same bounded reader the Excel imports use (a zip
 * bomb is refused), must contain `xl/workbook.xml`, and must not carry a macro project:
 * an `.xlsm` renamed to `.xlsx` would otherwise ride in as a drawing.
 */
async function isXlsx(bytes: Buffer): Promise<boolean> {
  if (!startsWith(bytes, ZIP_SIGNATURE)) return false;
  try {
    const zip = await openBoundedZip(bytes);
    return (
      zip.file('xl/workbook.xml') !== null &&
      zip.file('xl/vbaProject.bin') === null
    );
  } catch {
    return false;
  }
}

/** A text DXF opens with the group `0` / `SECTION`, ignoring blank lines and a BOM. */
function isTextDxf(bytes: Buffer): boolean {
  const text = bytes.subarray(0, 512).toString('utf8');
  const head = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = head
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines[0] === '0' && lines[1] === 'SECTION';
}

export const ATTACHMENT_TYPES: Readonly<Record<string, AttachmentType>> = {
  pdf: {
    contentType: 'application/pdf',
    matches: (bytes) => startsWith(bytes, PDF_SIGNATURE),
  },
  dwg: {
    contentType: 'application/acad',
    matches: (bytes) => startsWith(bytes, DWG_SIGNATURE),
  },
  dxf: { contentType: 'application/dxf', matches: isTextDxf },
  xlsx: {
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    matches: isXlsx,
  },
  png: {
    contentType: 'image/png',
    matches: (bytes) => startsWith(bytes, PNG_SIGNATURE),
  },
  jpg: {
    contentType: 'image/jpeg',
    matches: (bytes) => startsWith(bytes, JPEG_SIGNATURE),
  },
  jpeg: {
    contentType: 'image/jpeg',
    matches: (bytes) => startsWith(bytes, JPEG_SIGNATURE),
  },
};

export const ATTACHMENT_EXTENSIONS = Object.keys(ATTACHMENT_TYPES);

/** The lower-cased extension of a file name, or `null` when it has none. */
export function extensionOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}
