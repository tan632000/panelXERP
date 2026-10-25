import type { EstimatePanel } from "@plugins/sales/estimate/types";
import type { PanelFigures } from "@plugins/sales/estimate/utils/estimate-totals";

/**
 * What the reader has typed into a field and not saved yet, keyed by `draftKey`. The server
 * keeps the saved figures; these exist so the totals on screen move while a cell is typed.
 */
export type Drafts = Readonly<Record<string, string>>;

export type DraftField =
  | { kind: "panel"; id: number; field: "quantity" }
  | { kind: "bom"; id: number; field: "quantity" | "unitCost" }
  | { kind: "cost"; id: number; field: "amount" };

export function draftKey(field: DraftField): string {
  return `${field.kind}:${field.id}:${field.field}`;
}

/** The figures of a panel with the unsaved entries laid over the stored ones. */
export function panelFigures(
  panel: EstimatePanel,
  drafts: Drafts,
): PanelFigures {
  return {
    quantity: drafts[`panel:${panel.id}:quantity`] ?? panel.quantity,
    bomLines: panel.bomLines.map((line) => ({
      quantity: drafts[`bom:${line.id}:quantity`] ?? line.quantity,
      unitCost: drafts[`bom:${line.id}:unitCost`] ?? line.unitCost,
    })),
    costLines: panel.costLines.map((line) => ({
      amount: drafts[`cost:${line.id}:amount`] ?? line.amount,
    })),
  };
}

/**
 * The number a draft would save, or `null` when it is not one the server accepts: blank,
 * not a number, negative, or zero where a quantity must be positive.
 */
export function parseDraft(
  raw: string,
  options: { positive: boolean; integer?: boolean },
): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  if (options.positive && value <= 0) return null;
  if (options.integer && !Number.isInteger(value)) return null;
  return value;
}
