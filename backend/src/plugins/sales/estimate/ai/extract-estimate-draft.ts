import {
  type AttachmentRef,
  type DocumentStorage,
  type SkippedDocument,
  readDocuments,
} from './document-reader';
import {
  type CatalogItem,
  type PrefillTemplate,
  buildPrefillPrompt,
} from './prefill-prompt.builder';
import {
  type EstimateDraft,
  PREFILL_TOOL_SCHEMA,
  SUBMIT_ESTIMATE_TOOL,
  normalizeDraft,
} from './prefill-schema';

import type { AiClient, AiExtractRequest } from './ai-client.port';

export interface ExtractEstimateDraftInput {
  requirements: string;
  attachments: AttachmentRef[];
  template?: PrefillTemplate | null;
  catalog: CatalogItem[];
  storage: DocumentStorage;
}

/**
 * Documents + requirements + template + catalog in, a bounded, money-free draft out.
 * Throws a typed `AiError`; nothing here touches the database.
 */
export async function extractEstimateDraft(
  input: ExtractEstimateDraftInput,
  client: AiClient,
): Promise<{ draft: EstimateDraft; skipped: SkippedDocument[] }> {
  const { documents, skipped } = await readDocuments(
    input.attachments,
    input.storage,
  );
  const prompt = buildPrefillPrompt({
    requirements: input.requirements,
    documents,
    skipped,
    template: input.template,
    catalog: input.catalog,
  });
  const request: AiExtractRequest = {
    ...prompt,
    toolName: SUBMIT_ESTIMATE_TOOL,
    toolSchema: PREFILL_TOOL_SCHEMA,
  };
  let raw = await client.extract(request);
  // A long document can make the model stop part-way; ask again for the panels it did not finish.
  for (let attempt = 0; attempt < MAX_RESUMES; attempt++) {
    const redo = unfinishedPanels(raw);
    if (redo.length === 0) break;
    // The first answer is already usable, so a failed extra call must not fail the whole run.
    const more = await client
      .extract({
        ...request,
        content: [...request.content, { type: 'text', text: resumeNote(redo) }],
      })
      .catch(() => null);
    if (more === null) break;
    raw = replaceRows(raw, more, redo);
  }
  const draft = normalizeDraft(raw, new Set(input.catalog.map((c) => c.id)));
  return { draft, skipped };
}

/** Extra calls allowed per run; each one re-sends the whole document, so the cap bounds the cost. */
const MAX_RESUMES = 2;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 1-based numbers of the panels the model did not finish: those no row points at, plus the last
 * panel that has rows when empty ones follow it (it most likely stopped inside that panel). A lone
 * panel is left out: its rows may omit the pointer, and there is nothing to resume.
 */
export function unfinishedPanels(raw: unknown): number[] {
  if (
    !isRecord(raw) ||
    !Array.isArray(raw.panels) ||
    !Array.isArray(raw.rows)
  ) {
    return [];
  }
  if (raw.panels.length < 2) return [];
  const used = new Set(
    raw.rows.map((row) => (isRecord(row) ? row.panel : null)),
  );
  const numbers = raw.panels.map((_, i) => i + 1);
  const empty = numbers.filter((n) => !used.has(n));
  const lastFilled = Math.max(0, ...numbers.filter((n) => used.has(n)));
  const cut = lastFilled > 0 && empty.some((n) => n > lastFilled);
  return cut ? [lastFilled, ...empty] : empty;
}

const resumeNote = (redo: number[]): string =>
  `Lần chép trước đã dừng sớm: các tủ số ${redo.join(', ')} trong panels chưa có dòng nào hoặc mới chép dở. ` +
  'Hãy trả lại đầy đủ panels như cũ (giữ nguyên thứ tự và số thứ tự), và chép ĐẦY ĐỦ rows của những tủ đó từ đầu đến hết; không cần chép các tủ khác.';

/**
 * Swaps the rows of a redone panel for the second answer's, but only when the second answer read
 * at least as many rows of it: a worse retry must not cost what the first answer already had.
 * A malformed answer changes nothing.
 */
function replaceRows(first: unknown, more: unknown, redo: number[]): unknown {
  if (
    !isRecord(first) ||
    !Array.isArray(first.rows) ||
    !isRecord(more) ||
    !Array.isArray(more.rows)
  ) {
    return first;
  }
  const rowsOf = (rows: unknown[], panel: number): unknown[] =>
    rows.filter((row) => isRecord(row) && row.panel === panel);
  let rows: unknown[] = first.rows;
  for (const panel of redo) {
    const fresh = rowsOf(more.rows, panel);
    if (fresh.length === 0 || fresh.length < rowsOf(rows, panel).length) {
      continue;
    }
    rows = [...rows.filter((row) => !rowsOf([row], panel).length), ...fresh];
  }
  return { ...first, rows };
}
