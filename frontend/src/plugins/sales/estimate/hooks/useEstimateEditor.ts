"use client";

import { useState } from "react";

import { useEstimateEdits } from "@plugins/sales/estimate/hooks/api/useEstimate";
import {
  draftKey,
  parseDraft,
  type DraftField,
  type Drafts,
} from "@plugins/sales/estimate/utils/estimate-drafts";

/** A quantity must be above zero; a cost may be zero. Panels are counted in whole units. */
function parseOptionsOf(field: DraftField) {
  const isQuantity = field.field === "quantity";
  // Panels are counted in whole units and cost lines in whole VND.
  return { positive: isQuantity, integer: field.kind !== "bom" };
}

/**
 * The state of one draft revision being edited: what is typed and not saved yet, and the
 * saving of it. A cell saves when it loses focus; until then its typed value feeds the live
 * totals, and afterwards the server's answer replaces it.
 */
export function useEstimateEditor(estimateId: number, revisionKey?: number) {
  const edits = useEstimateEdits(estimateId, revisionKey);
  const [drafts, setDrafts] = useState<Drafts>({});

  const setDraft = (field: DraftField, value: string) =>
    setDrafts((previous) => ({ ...previous, [draftKey(field)]: value }));

  const drop = (field: DraftField) =>
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[draftKey(field)];
      return next;
    });

  /** Saves the typed value of a cell when it differs from the saved `saved`, else reverts it. */
  const commit = (field: DraftField, saved: number) => {
    const raw = drafts[draftKey(field)];
    if (raw === undefined) return;
    const value = parseDraft(raw, parseOptionsOf(field));
    if (value === null || value === saved) {
      drop(field);
      return;
    }
    const settle = { onSettled: () => drop(field) };

    if (field.kind === "panel") {
      edits.updatePanel.mutate(
        { panelId: field.id, data: { quantity: value } },
        settle,
      );
    } else if (field.kind === "bom" && field.field === "unitCost") {
      // Only the pricing route takes a unit cost; the draft BOM route refuses it.
      edits.setUnitCost.mutate(
        { lineId: field.id, data: { unitCost: value } },
        settle,
      );
    } else if (field.kind === "bom") {
      edits.updateBomLine.mutate(
        { lineId: field.id, data: { quantity: value } },
        settle,
      );
    } else {
      edits.updateCostLine.mutate(
        { lineId: field.id, data: { amount: value } },
        settle,
      );
    }
  };

  const busy = Object.values(edits).some((mutation) => mutation.isPending);

  return {
    edits,
    drafts,
    setDraft,
    commit,
    /** Something typed is not saved yet, or a save is in flight. */
    unsaved: Object.keys(drafts).length > 0 || busy,
    busy,
  };
}

export type EstimateEditor = ReturnType<typeof useEstimateEditor>;
