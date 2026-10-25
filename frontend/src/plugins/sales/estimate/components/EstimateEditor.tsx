"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { Tabs } from "@/kernel/core/components/ui/Tabs";
import { formatCurrency, formatNumber } from "@/kernel/core/lib/formatters";

import { ESTIMATE_PANEL_QUANTITY_MAX } from "@plugins/sales/estimate/constants";
import {
  draftKey,
  panelFigures,
} from "@plugins/sales/estimate/utils/estimate-drafts";
import {
  computePanelTotals,
  computeRevisionTotal,
} from "@plugins/sales/estimate/utils/estimate-totals";

import { EstimateBomGrid } from "./EstimateBomGrid";
import { EstimateCostLines } from "./EstimateCostLines";
import { EstimatePanelModal } from "./EstimatePanelModal";

import type { EstimateEditor as EstimateEditorState } from "@plugins/sales/estimate/hooks/useEstimateEditor";
import type { EstimateRevision } from "@plugins/sales/estimate/types";

interface EstimateEditorProps {
  revision: EstimateRevision;
  editor: EstimateEditorState;
  /** False for a submitted or superseded revision, or a reader without edit rights. */
  editable: boolean;
}

/**
 * Panels as tabs, each with its materials and cost lines, and the totals underneath. Every
 * figure shown is computed here from the stored values plus whatever is typed and not saved;
 * the server's own totals replace them the moment a change is saved.
 */
export function EstimateEditor({
  revision,
  editor,
  editable,
}: EstimateEditorProps) {
  const t = useTranslations("estimate");
  const tCommon = useTranslations("common");
  const { drafts, setDraft, commit, edits } = editor;

  const [chosenPanelId, setChosenPanelId] = useState<number | null>(null);
  const [panelModal, setPanelModal] = useState<"add" | "edit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const panels = revision.panels;
  // A panel that vanished (deleted, or a revision switched) falls back to the first one.
  const panel =
    panels.find((entry) => entry.id === chosenPanelId) ?? panels[0] ?? null;

  const liveTotals = panels.map((entry) =>
    computePanelTotals(panelFigures(entry, drafts)),
  );
  const revisionTotal = computeRevisionTotal(
    panels.map((entry) => panelFigures(entry, drafts)),
  );

  const activeTotals = panel ? liveTotals[panels.indexOf(panel)] : null;
  const quantityField = panel
    ? ({ kind: "panel", id: panel.id, field: "quantity" } as const)
    : null;

  return (
    <>
      <DetailSection
        title={t("panels")}
        action={
          editable ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand"
              onClick={() => setPanelModal("add")}
            >
              <Icon name="plus" size={14} />
              {t("panel.add")}
            </button>
          ) : null
        }
      >
        {panel && activeTotals && quantityField ? (
          <div className="flex flex-col gap-4">
            <Tabs
              aria-label={t("panels")}
              activeKey={String(panel.id)}
              onChange={(key) => setChosenPanelId(Number(key))}
              items={panels.map((entry) => ({
                key: String(entry.id),
                label: entry.tag,
                count: entry.bomLines.length,
              }))}
            />

            <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border-secondary p-3">
              <div className="min-w-48 flex-1">
                <div className="text-xs font-semibold uppercase text-text-tertiary">
                  {t("panel.description")}
                </div>
                <div className="text-sm text-text-primary">
                  {panel.description || t("emptyValue")}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-text-tertiary">
                  {t("panel.quantity")}
                </div>
                {editable ? (
                  <NumberInput
                    aria-label={t("panel.quantityOf", { tag: panel.tag })}
                    className="w-24 text-right"
                    value={drafts[draftKey(quantityField)] ?? panel.quantity}
                    decimalScale={0}
                    allowNegative={false}
                    max={ESTIMATE_PANEL_QUANTITY_MAX}
                    onChange={(event) =>
                      setDraft(quantityField, event.target.value)
                    }
                    onBlur={() => commit(quantityField, panel.quantity)}
                  />
                ) : (
                  <div className="text-sm font-semibold">{panel.quantity}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase text-text-tertiary">
                  {t("panel.unitCost")}
                </div>
                <div
                  className="text-sm font-semibold tabular-nums"
                  data-testid="panel-unit-cost"
                >
                  {formatCurrency(activeTotals.unitCost)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase text-text-tertiary">
                  {t("panel.total")}
                </div>
                <div
                  className="text-sm font-bold tabular-nums"
                  data-testid="panel-total"
                >
                  {formatCurrency(activeTotals.total)}
                </div>
              </div>
              {editable ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="cursor-pointer text-text-secondary"
                    aria-label={t("panel.edit")}
                    title={t("panel.edit")}
                    onClick={() => setPanelModal("edit")}
                  >
                    <Icon name="edit" size={18} />
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer text-danger-text"
                    aria-label={t("panel.remove")}
                    title={t("panel.remove")}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <h5 className="text-sm font-semibold text-brand">
                {t("bom.title")}
              </h5>
              <EstimateBomGrid
                panel={panel}
                editor={editor}
                editable={editable}
              />
            </div>

            <div className="flex flex-col gap-2">
              <h5 className="text-sm font-semibold text-brand">
                {t("cost.title")}
              </h5>
              <EstimateCostLines
                panel={panel}
                editor={editor}
                editable={editable}
              />
              <p className="text-xs text-text-tertiary">{t("cost.hint")}</p>
            </div>
          </div>
        ) : (
          <EmptyState bordered={false} icon="package" message={t("noPanels")} />
        )}
      </DetailSection>

      <DetailSection title={t("summary.title")}>
        <div className="overflow-x-auto rounded-lg border border-border-secondary">
          <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-surface-secondary text-left text-xs font-semibold uppercase text-text-tertiary">
                <th className="px-3 py-2">{t("panel.tag")}</th>
                <th className="px-3 py-2 text-right">{t("panel.quantity")}</th>
                <th className="px-3 py-2 text-right">{t("panel.unitCost")}</th>
                <th className="px-3 py-2 text-right">{t("panel.total")}</th>
              </tr>
            </thead>
            <tbody>
              {panels.map((entry, index) => (
                <tr key={entry.id}>
                  <td className="border-t border-border-secondary px-3 py-2">
                    {entry.tag}
                  </td>
                  <td className="border-t border-border-secondary px-3 py-2 text-right tabular-nums">
                    {formatNumber(
                      Number(
                        drafts[`panel:${entry.id}:quantity`] ?? entry.quantity,
                      ) || 0,
                    )}
                  </td>
                  <td className="border-t border-border-secondary px-3 py-2 text-right tabular-nums">
                    {formatCurrency(liveTotals[index].unitCost)}
                  </td>
                  <td className="border-t border-border-secondary px-3 py-2 text-right tabular-nums">
                    {formatCurrency(liveTotals[index].total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={3}
                  className="border-t border-border-secondary px-3 py-2 text-right font-semibold"
                >
                  {t("summary.total")}
                </td>
                <td
                  className="border-t border-border-secondary px-3 py-2 text-right text-base font-bold tabular-nums"
                  data-testid="revision-total"
                >
                  {formatCurrency(revisionTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">{t("summary.hint")}</p>
      </DetailSection>

      <EstimatePanelModal
        isOpen={panelModal === "add"}
        onClose={() => setPanelModal(null)}
        onSubmit={(data) => edits.addPanel.mutateAsync(data)}
      />
      {panel ? (
        <EstimatePanelModal
          isOpen={panelModal === "edit"}
          onClose={() => setPanelModal(null)}
          panel={panel}
          onSubmit={(data) =>
            edits.updatePanel.mutateAsync({ panelId: panel.id, data })
          }
        />
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        title={t("panel.removeTitle")}
        description={t("panel.removeDescription", { tag: panel?.tag ?? "" })}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        pending={edits.deletePanel.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!panel) return;
          edits.deletePanel.mutate(panel.id, {
            onSettled: () => setConfirmDelete(false),
          });
        }}
      />
    </>
  );
}
