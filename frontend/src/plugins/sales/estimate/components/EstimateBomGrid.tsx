"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { LINE_TABLE_SCROLL_CLASS } from "@/kernel/core/components/ui/line-table-styles";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { formatNumber } from "@/kernel/core/lib/formatters";

import { EstimateItemPicker } from "@plugins/sales/estimate/components/EstimateItemPicker";
import {
  BOM_QUANTITY_DECIMALS,
  ESTIMATE_NOTE_MAX,
  MONEY_DECIMALS,
} from "@plugins/sales/estimate/constants";
import { draftKey } from "@plugins/sales/estimate/utils/estimate-drafts";
import { bomLineAmount } from "@plugins/sales/estimate/utils/estimate-totals";

import type { EstimateEditor } from "@plugins/sales/estimate/hooks/useEstimateEditor";
import type {
  EstimateBomLine,
  EstimatePanel,
} from "@plugins/sales/estimate/types";

const CELL = "border-b border-border-secondary px-2 py-1.5 align-middle";
const HEAD =
  "border-b border-border-secondary bg-surface-secondary px-2 py-2 text-left text-xs font-semibold uppercase text-text-tertiary";
const NUMBER_CELL = `${CELL} text-right tabular-nums`;

interface EstimateBomGridProps {
  panel: EstimatePanel;
  editor: EstimateEditor;
  /** False for a submitted or superseded revision, or a reader without edit rights. */
  editable: boolean;
}

/** The materials of one panel; each row's amount follows what is typed into it. */
export function EstimateBomGrid({
  panel,
  editor,
  editable,
}: EstimateBomGridProps) {
  const t = useTranslations("estimate");
  const tCommon = useTranslations("common");
  const { drafts, setDraft, commit, edits } = editor;
  const [lineToRemove, setLineToRemove] = useState<EstimateBomLine | null>(
    null,
  );
  const quantityDigits = { maximumFractionDigits: BOM_QUANTITY_DECIMALS };
  const moneyDigits = { maximumFractionDigits: MONEY_DECIMALS };

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className={LINE_TABLE_SCROLL_CLASS}>
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={HEAD}>{t("bom.code")}</th>
                <th className={HEAD}>{t("bom.name")}</th>
                <th className={HEAD}>{t("bom.brand")}</th>
                <th className={HEAD}>{t("bom.unit")}</th>
                <th className={`${HEAD} text-right`}>{t("bom.quantity")}</th>
                <th className={`${HEAD} text-right`}>{t("bom.unitCost")}</th>
                <th className={`${HEAD} text-right`}>{t("bom.amount")}</th>
                <th className={HEAD}>{t("bom.note")}</th>
                {editable ? <th className={`${HEAD} w-12`} /> : null}
              </tr>
            </thead>
            <tbody>
              {panel.bomLines.length === 0 ? (
                <tr>
                  <td
                    colSpan={editable ? 9 : 8}
                    className={`${CELL} text-center text-text-secondary`}
                  >
                    {t("bom.empty")}
                  </td>
                </tr>
              ) : null}
              {panel.bomLines.map((line) => {
                const quantityField = {
                  kind: "bom",
                  id: line.id,
                  field: "quantity",
                } as const;
                const costField = {
                  kind: "bom",
                  id: line.id,
                  field: "unitCost",
                } as const;
                const quantity =
                  drafts[draftKey(quantityField)] ?? line.quantity;
                const unitCost = drafts[draftKey(costField)] ?? line.unitCost;

                return (
                  <tr key={line.id}>
                    <td className={`${CELL} font-mono`}>{line.itemCode}</td>
                    <td className={CELL}>{line.itemName}</td>
                    <td className={CELL}>
                      {line.itemBrand || t("emptyValue")}
                    </td>
                    <td className={CELL}>{line.itemUnit}</td>
                    <td className={NUMBER_CELL}>
                      {editable ? (
                        <NumberInput
                          aria-label={t("bom.quantityOf", {
                            code: line.itemCode,
                          })}
                          className="w-28 text-right"
                          value={quantity}
                          decimalScale={BOM_QUANTITY_DECIMALS}
                          allowNegative={false}
                          onChange={(event) =>
                            setDraft(quantityField, event.target.value)
                          }
                          onBlur={() => commit(quantityField, line.quantity)}
                        />
                      ) : (
                        formatNumber(line.quantity, quantityDigits)
                      )}
                    </td>
                    <td className={NUMBER_CELL}>
                      {editable ? (
                        <NumberInput
                          aria-label={t("bom.unitCostOf", {
                            code: line.itemCode,
                          })}
                          className="w-36 text-right"
                          value={unitCost}
                          decimalScale={MONEY_DECIMALS}
                          allowNegative={false}
                          onChange={(event) =>
                            setDraft(costField, event.target.value)
                          }
                          onBlur={() => commit(costField, line.unitCost)}
                        />
                      ) : (
                        formatNumber(line.unitCost, moneyDigits)
                      )}
                    </td>
                    <td
                      className={`${NUMBER_CELL} font-semibold`}
                      data-testid={`bom-amount-${line.id}`}
                    >
                      {formatNumber(bomLineAmount(quantity, unitCost))}
                    </td>
                    <td className={CELL}>
                      {editable ? (
                        <input
                          aria-label={t("bom.noteOf", { code: line.itemCode })}
                          className="w-44 rounded-md border border-border-secondary bg-surface-primary px-2 py-1.5 text-sm"
                          defaultValue={line.note ?? ""}
                          maxLength={ESTIMATE_NOTE_MAX}
                          onBlur={(event) => {
                            const note = event.target.value.trim();
                            if (note !== (line.note ?? "")) {
                              edits.updateBomLine.mutate({
                                lineId: line.id,
                                data: { note: note || null },
                              });
                            }
                          }}
                        />
                      ) : (
                        line.note || t("emptyValue")
                      )}
                    </td>
                    {editable ? (
                      <td className={CELL}>
                        <button
                          type="button"
                          className="cursor-pointer text-danger-text"
                          aria-label={t("bom.removeLine", {
                            code: line.itemCode,
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
          <div className="max-w-md">
            <EstimateItemPicker
              disabled={edits.addBomLine.isPending}
              onPick={(item) =>
                edits.addBomLine.mutate({
                  panelId: panel.id,
                  data: { itemId: item.id, quantity: 1 },
                })
              }
            />
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={lineToRemove !== null}
        title={t("bom.removeTitle")}
        description={t("bom.removeDescription", {
          code: lineToRemove?.itemCode ?? "",
        })}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        pending={edits.deleteBomLine.isPending}
        onCancel={() => setLineToRemove(null)}
        onConfirm={() => {
          if (!lineToRemove) return;
          edits.deleteBomLine.mutate(lineToRemove.id, {
            onSettled: () => setLineToRemove(null),
          });
        }}
      />
    </>
  );
}
