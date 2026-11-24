import ExcelJS from 'exceljs';

import {
  ATTACHMENT_TYPES,
  extensionOf,
} from '@plugins/sales/request/utils/attachment-type.util';

export const MAX_DOCUMENTS = 10;
export const MAX_TOTAL_BASE64_BYTES = 20 * 1024 * 1024;
export const MAX_EXCEL_TEXT_BYTES = 200 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_EXCEL_SHEETS = 3;

export interface AttachmentRef {
  fileName: string;
  storageKey: string;
}
export interface DocumentStorage {
  getObjectBuffer(key: string): Promise<Buffer>;
}
export interface ReadDocument {
  fileName: string;
  kind: 'document' | 'image' | 'text';
  mediaType?: string;
  /** base64 for `document` / `image`. */
  data?: string;
  /** Sheet text for `text`. */
  text?: string;
}
export interface SkippedDocument {
  fileName: string;
  reason: string;
}

const isMissingObject = (error: unknown): boolean =>
  error instanceof Error && error.name === 'NoSuchKey';

async function excelToText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const parts: string[] = [];
  let size = 0;
  for (const sheet of workbook.worksheets.slice(0, MAX_EXCEL_SHEETS)) {
    parts.push(`# ${sheet.name}`);
    sheet.eachRow((row) => {
      if (size > MAX_EXCEL_TEXT_BYTES) return;
      const cells = (row.values as ExcelJS.CellValue[]).slice(1);
      const line = cells.map((cell) => cellText(cell)).join('\t');
      size += line.length + 1;
      parts.push(line);
    });
  }
  // Cut by bytes, not characters: the cap is on what is sent.
  return Buffer.from(parts.join('\n'))
    .subarray(0, MAX_EXCEL_TEXT_BYTES)
    .toString('utf8');
}

function cellText(cell: ExcelJS.CellValue): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell !== 'object') return String(cell);
  if ('result' in cell) return cellText(cell.result);
  if ('richText' in cell) return cell.richText.map((r) => r.text).join('');
  if ('text' in cell) return String(cell.text);
  return '';
}

/**
 * Loads a request's attachments for the model. Only the first {@link MAX_DOCUMENTS} are read
 * and the base64 payload is capped; whatever cannot be sent is reported as skipped with a
 * reason instead of failing the run. Any other storage error propagates.
 */
export async function readDocuments(
  attachments: AttachmentRef[],
  storage: DocumentStorage,
): Promise<{ documents: ReadDocument[]; skipped: SkippedDocument[] }> {
  const documents: ReadDocument[] = [];
  const skipped: SkippedDocument[] = [];
  let total = 0;

  for (const [index, att] of attachments.entries()) {
    const skip = (reason: string) =>
      skipped.push({ fileName: att.fileName, reason });
    if (index >= MAX_DOCUMENTS) {
      skip(`Vượt quá ${MAX_DOCUMENTS} tệp.`);
      continue;
    }
    const ext = extensionOf(att.fileName);
    const isBinary =
      ext === 'pdf' || ext === 'png' || ext === 'jpg' || ext === 'jpeg';
    if (!isBinary && ext !== 'xlsx') {
      skip('Định dạng chưa được AI hỗ trợ.');
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await storage.getObjectBuffer(att.storageKey);
    } catch (error) {
      if (!isMissingObject(error)) throw error;
      skip('Không tìm thấy tệp trong kho lưu trữ.');
      continue;
    }

    // The API refuses an image over 5 MB, which would fail the whole run.
    if (
      (ext === 'png' || ext === 'jpg' || ext === 'jpeg') &&
      buffer.length > MAX_IMAGE_BYTES
    ) {
      skip('Ảnh lớn hơn 5 MB.');
      continue;
    }

    let doc: ReadDocument;
    if (isBinary) {
      doc = {
        fileName: att.fileName,
        kind: ext === 'pdf' ? 'document' : 'image',
        mediaType: ATTACHMENT_TYPES[ext].contentType,
        data: buffer.toString('base64'),
      };
    } else {
      try {
        doc = {
          fileName: att.fileName,
          kind: 'text',
          text: await excelToText(buffer),
        };
      } catch {
        skip('Không đọc được tệp Excel.');
        continue;
      }
    }

    const size = (doc.data ?? doc.text ?? '').length;
    if (total + size > MAX_TOTAL_BASE64_BYTES) {
      skip('Vượt giới hạn dung lượng gửi AI.');
      continue;
    }
    total += size;
    documents.push(doc);
  }
  return { documents, skipped };
}
