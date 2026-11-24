import {
  MAX_BOM_QUANTITY,
  MAX_DESCRIPTION_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PANEL_QUANTITY,
  MAX_TAG_LENGTH,
} from '@plugins/sales/estimate/constants/estimate.constant';

import { AiOutputInvalidError } from './ai-errors';
import { redactMoney } from './redact-money';

export const SUBMIT_ESTIMATE_TOOL = 'submit_estimate';

export const MAX_PANELS = 50;
export const MAX_LINES = 500;
export const MAX_UNMATCHED = 50;
export const MAX_AI_NOTE_LENGTH = 1000;
export const MAX_SUMMARY_LENGTH = 2000;
const MAX_WHERE_LENGTH = 60;

export interface DraftLine {
  itemId: number;
  quantity: number;
  confidence: number;
  note: string;
}
export interface DraftPanel {
  tag: string;
  description: string;
  quantity: number;
  aiNote: string;
  lines: DraftLine[];
}
export interface DraftUnmatched {
  description: string;
  quantity?: number;
  reason: string;
}
export interface EstimateDraft {
  requirementsSummary: string;
  panels: DraftPanel[];
  unmatched: DraftUnmatched[];
}

/**
 * The model transcribes the document row by row (`rows`) and decides a catalog match per row
 * (`itemId`, null when there is none). It never writes a line quantity: the server groups the
 * rows by item and sums them, so no addition is left to the model.
 */
export const PREFILL_TOOL_SCHEMA = {
  type: 'object',
  required: ['requirementsSummary', 'panels'],
  properties: {
    requirementsSummary: { type: 'string' },
    panels: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tag', 'description', 'quantity', 'aiNote', 'rows'],
        properties: {
          tag: { type: 'string' },
          description: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
          aiNote: { type: 'string' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              required: [
                'where',
                'text',
                'quantity',
                'itemId',
                'confidence',
                'note',
              ],
              properties: {
                where: { type: 'string' },
                text: { type: 'string' },
                code: { type: 'string' },
                quantity: { type: 'number' },
                itemId: { type: ['integer', 'null'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                note: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

const invalid = (): never => {
  throw new AiOutputInvalidError();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : invalid();

const asArray = (value: unknown, max: number): unknown[] =>
  Array.isArray(value) && value.length <= max ? value : invalid();

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : invalid();

/** Free text: money removed first, then cut to the column width. A missing optional is ''. */
function text(value: unknown, max: number, required = true): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') return invalid();
  return redactMoney(value).trim().slice(0, max);
}

function uniqueTag(raw: string, taken: Set<string>): string {
  let tag = raw;
  for (let n = 2; taken.has(tag.toLowerCase()); n++) {
    const suffix = `-${n}`;
    tag = raw.slice(0, MAX_TAG_LENGTH - suffix.length) + suffix;
  }
  taken.add(tag.toLowerCase());
  return tag;
}

/** Rows of one catalog item inside a panel, waiting to become a single line. */
interface RowGroup {
  parts: Array<{ where: string; quantity: number }>;
  confidence: number;
  notes: Set<string>;
}

const roundQuantity = (value: number): number =>
  Math.round(value * 1000) / 1000;

/** The sum goes first so the cut at the note width never hides it. */
function lineNote(total: number, group: RowGroup): string {
  const sum =
    group.parts.length > 1
      ? `Cộng ${total} từ: ${group.parts
          .map((p) => `${p.where} ${p.quantity}`)
          .join(' + ')}.`
      : '';
  return [sum, ...group.notes]
    .filter(Boolean)
    .join(' ')
    .slice(0, MAX_NOTE_LENGTH);
}

/**
 * Validates the tool input against the bounds the estimate tables take. Structural breaks
 * (wrong type, out-of-range panel quantity or confidence, too many panels/rows) reject the
 * whole output; a single unusable row is dropped and noted on its panel instead.
 */
export function normalizeDraft(
  raw: unknown,
  catalogIds: ReadonlySet<number>,
): EstimateDraft {
  const root = asRecord(raw);
  const panelsRaw = asArray(root.panels, MAX_PANELS);
  const taken = new Set<string>();
  let rowCount = 0;
  const panels: DraftPanel[] = [];
  const unmatched: DraftUnmatched[] = [];

  for (const [panelIndex, panelValue] of panelsRaw.entries()) {
    const p = asRecord(panelValue);
    const quantity = asNumber(p.quantity);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_PANEL_QUANTITY
    ) {
      invalid();
    }
    // A tag that was only a price is not worth rejecting the run for.
    const tagText = text(p.tag, Infinity) || `P${panelIndex + 1}`;
    const notes: string[] = [];
    const aiNote = text(p.aiNote, MAX_AI_NOTE_LENGTH, false);
    if (aiNote) notes.push(aiNote);

    const groups = new Map<number, RowGroup>();
    const rowsRaw = asArray(p.rows, MAX_LINES);
    rowCount += rowsRaw.length;
    if (rowCount > MAX_LINES) invalid();
    for (const rowValue of rowsRaw) {
      const r = asRecord(rowValue);
      const rowQuantity = asNumber(r.quantity);
      const confidence = asNumber(r.confidence);
      if (confidence < 0 || confidence > 1) invalid();
      const itemId =
        r.itemId === null || r.itemId === undefined ? null : asNumber(r.itemId);
      const note = text(r.note, MAX_NOTE_LENGTH, false);
      const quantityUsable = rowQuantity > 0 && rowQuantity <= MAX_BOM_QUANTITY;

      if (itemId === null) {
        const code = text(r.code, MAX_DESCRIPTION_LENGTH, false);
        const description = text(r.text, MAX_DESCRIPTION_LENGTH, false);
        const entry: DraftUnmatched = {
          description: (code ? `${description} (${code})` : description).slice(
            0,
            MAX_DESCRIPTION_LENGTH,
          ),
          reason: note || 'Không có vật tư tương ứng trong danh mục.',
        };
        if (quantityUsable) entry.quantity = rowQuantity;
        unmatched.push(entry);
      } else if (!catalogIds.has(itemId)) {
        notes.push(`Bỏ dòng: vật tư #${itemId} không có trong danh mục.`);
      } else if (!quantityUsable) {
        notes.push(
          `Bỏ dòng: số lượng ${rowQuantity} của vật tư #${itemId} không hợp lệ.`,
        );
      } else {
        const group = groups.get(itemId) ?? {
          parts: [],
          confidence: 1,
          notes: new Set<string>(),
        };
        group.parts.push({
          where: text(r.where, MAX_WHERE_LENGTH, false) || '-',
          quantity: rowQuantity,
        });
        // The least sure row decides how far the engineer should trust the whole line.
        group.confidence = Math.min(group.confidence, confidence);
        if (note) group.notes.add(note);
        groups.set(itemId, group);
      }
    }

    const lines: DraftLine[] = [];
    for (const [itemId, group] of groups) {
      const total = roundQuantity(
        group.parts.reduce((sum, part) => sum + part.quantity, 0),
      );
      if (total > MAX_BOM_QUANTITY) {
        notes.push(
          `Bỏ dòng: số lượng ${total} của vật tư #${itemId} không hợp lệ.`,
        );
        continue;
      }
      lines.push({
        itemId,
        quantity: total,
        confidence: group.confidence,
        note: lineNote(total, group),
      });
    }
    if (lines.length === 0) continue;

    panels.push({
      tag: uniqueTag(tagText.slice(0, MAX_TAG_LENGTH), taken),
      description: text(p.description, MAX_DESCRIPTION_LENGTH),
      quantity,
      aiNote: notes.join('\n').slice(0, MAX_AI_NOTE_LENGTH),
      lines,
    });
  }

  return {
    requirementsSummary: text(root.requirementsSummary, MAX_SUMMARY_LENGTH),
    panels,
    unmatched: unmatched.slice(0, MAX_UNMATCHED),
  };
}
