"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { LINE_TABLE_SCROLL_CLASS } from "@/kernel/core/components/ui/line-table-styles";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { formatNumber } from "@/kernel/core/lib/formatters";

import {
  COST_CATEGORIES,
  ESTIMATE_DESCRIPTION_MAX,
  type CostCategory,
} from "@plugins/sales/estimate/constants";
import { draftKey } from "@plugins/sales/estimate/utils/estimate-drafts";

import type { EstimateEditor } from "@plugins/sales/estimate/hooks/useEstimateEditor";
import type {
  EstimateCostLine,
  EstimatePanel,
} from "@plugins/sales/estimate/types";

const CELL = "border-b border-border-secondary px-2 py-1.5 align-middle";
const HEAD =
  "border-b border-border-secondary bg-surface-secondary px-2 py-2 text-left text-xs font-semibold uppercase text-text-tertiary";

interface EstimateCostLinesProps {
  panel: EstimatePanel;
  editor: EstimateEditor;
  editable: boolean;
}

/** The costs of building ONE panel beyond its materials: design, labor, installation… */
export function EstimateCostLines({
  panel,
  editor,
  editable,
}: EstimateCostLinesProps) {
  const t = useTranslations("estimate");
  const tCommon = useTranslations("common");
  const { drafts, setDraft, commit, edits } = editor;
  const [lineToRemove, setLineToRemove] = useState<EstimateCostLine | null>(
    null,
  );
  const costLines = panel.costLines ?? [];
  const categoryOptions = COST_CATEGORIES.map((value) => ({
    value,
    label: t(`categories.${value}`),
  }));

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className={LINE_TABLE_SCROLL_CLASS}>
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={HEAD}>{t("cost.category")}</th>
                <th className={HEAD}>{t("cost.description")}</th>
                <th className={`${HEAD} text-right`}>{t("cost.amount")}</th>
                {editable ? <th className={`${HEAD} w-12`} /> : null}
              </tr>
            </thead>
            <tbody>
              {costLines.length === 0 ? (
                <tr>
                  <td
                    colSpan={editable ? 4 : 3}
                    className={`${CELL} text-center text-text-secondary`}
                  >
                    {t("cost.empty")}
                  </td>
                </tr>
              ) : null}
              {costLines.map((line) => {
                const amountField = {
                  kind: "cost",
                  id: line.id,
                  field: "amount",
                } as const;
                return (
                  <tr key={line.id}>
                    <td className={`${CELL} w-52`}>
                      {editable ? (
                        <FormSelect
                          label={t("cost.categoryOf")}
                          labelHidden
                          options={categoryOptions}
                          value={line.category}
                          onChange={(event) =>
                            edits.updateCostLine.mutate({
                              lineId: line.id,
                              data: {
                                category: event.target.value as CostCategory,
                              },
                            })
                          }
                        />
                      ) : (
                        t(`categories.${line.category}`)
                      )}
                    </td>
                    <td className={CELL}>
                      {editable ? (
                        <input
                          aria-label={t("cost.descriptionOf", {
                            category: t(`categories.${line.category}`),
                          })}
                          className="w-full rounded-md border border-border-secondary bg-surface-primary px-2 py-1.5 text-sm"
                          defaultValue={line.description ?? ""}
                          maxLength={ESTIMATE_DESCRIPTION_MAX}
                          onBlur={(event) => {
                            const description = event.target.value.trim();
                            if (description !== (line.description ?? "")) {
                              edits.updateCostLine.mutate({
                                lineId: line.id,
                                data: { description: description || null },
                              });
                            }
                          }}
                        />
                      ) : (
                        line.description || t("emptyValue")
                      )}
                    </td>
                    <td className={`${CELL} text-right tabular-nums`}>
                      {editable ? (
                        <NumberInput
                          aria-label={t("cost.amountOf", {
                            category: t(`categories.${line.category}`),
                          })}
                          className="w-40 text-right"
                          value={drafts[draftKey(amountField)] ?? line.amount}
                          decimalScale={0}
                          allowNegative={false}
                          onChange={(event) =>
                            setDraft(amountField, event.target.value)
                          }
                          onBlur={() => commit(amountField, line.amount)}
                        />
                      ) : (
                        formatNumber(line.amount)
                      )}
                    </td>
                    {editable ? (
                      <td className={CELL}>
                        <button
                          type="button"
                          className="cursor-pointer text-danger-text"
                          aria-label={t("cost.removeLine", {
                            category: t(`categories.${line.category}`),
                          })}
                          onClick={() => setLineToRemove(line)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable ? (
          <div>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand"
              disabled={edits.addCostLine.isPending}
              onClick={() =>
                edits.addCostLine.mutate({
                  panelId: panel.id,
                  data: { category: "labor", amount: 0 },
                })
              }
            >
              <Icon name="plus" size={14} />
              {t("cost.add")}
            </button>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={lineToRemove !== null}
        title={t("cost.removeTitle")}
        description={t("cost.removeDescription", {
          category: lineToRemove
            ? t(`categories.${lineToRemove.category}`)
            : "",
        })}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        pending={edits.deleteCostLine.isPending}
        onCancel={() => setLineToRemove(null)}
        onConfirm={() => {
          if (!lineToRemove) return;
          edits.deleteCostLine.mutate(lineToRemove.id, {
            onSettled: () => setLineToRemove(null),
          });
        }}
      />
    </>
  );
}
