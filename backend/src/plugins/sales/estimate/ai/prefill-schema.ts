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

export const PREFILL_TOOL_SCHEMA = {
  type: 'object',
  required: ['requirementsSummary', 'panels', 'unmatched'],
  properties: {
    requirementsSummary: { type: 'string' },
    panels: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tag', 'description', 'quantity', 'aiNote', 'lines'],
        properties: {
          tag: { type: 'string' },
          description: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
          aiNote: { type: 'string' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              required: ['itemId', 'quantity', 'confidence', 'note'],
              properties: {
                itemId: { type: 'integer' },
                quantity: { type: 'number' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                note: { type: 'string' },
              },
            },
          },
        },
      },
    },
    unmatched: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'reason'],
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number' },
          reason: { type: 'string' },
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

/**
 * Validates the tool input against the bounds the estimate tables take. Structural breaks
 * (wrong type, out-of-range panel quantity or confidence, too many panels/lines) reject the
 * whole output; a single unusable line is dropped and noted on its panel instead.
 */
export function normalizeDraft(
  raw: unknown,
  catalogIds: ReadonlySet<number>,
): EstimateDraft {
  const root = asRecord(raw);
  const panelsRaw = asArray(root.panels, MAX_PANELS);
  const taken = new Set<string>();
  let lineCount = 0;
  const panels: DraftPanel[] = [];

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

    const lines: DraftLine[] = [];
    const linesRaw = asArray(p.lines, MAX_LINES);
    lineCount += linesRaw.length;
    if (lineCount > MAX_LINES) invalid();
    for (const lineValue of linesRaw) {
      const l = asRecord(lineValue);
      const itemId = asNumber(l.itemId);
      const lineQuantity = asNumber(l.quantity);
      const confidence = asNumber(l.confidence);
      if (confidence < 0 || confidence > 1) invalid();
      const note = text(l.note, MAX_NOTE_LENGTH, false);
      if (!catalogIds.has(itemId)) {
        notes.push(`Bỏ dòng: vật tư #${itemId} không có trong danh mục.`);
      } else if (lineQuantity <= 0 || lineQuantity > MAX_BOM_QUANTITY) {
        notes.push(
          `Bỏ dòng: số lượng ${lineQuantity} của vật tư #${itemId} không hợp lệ.`,
        );
      } else {
        lines.push({ itemId, quantity: lineQuantity, confidence, note });
      }
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

  const unmatched = asArray(root.unmatched ?? [], Infinity)
    .slice(0, MAX_UNMATCHED)
    .map((value): DraftUnmatched => {
      const u = asRecord(value);
      const entry: DraftUnmatched = {
        description: text(u.description, MAX_DESCRIPTION_LENGTH),
        reason: text(u.reason, MAX_NOTE_LENGTH),
      };
      if (u.quantity !== undefined) entry.quantity = asNumber(u.quantity);
      return entry;
    });

  return {
    requirementsSummary: text(root.requirementsSummary, MAX_SUMMARY_LENGTH),
    panels,
    unmatched,
  };
}
