"use client";

import { Decimal } from "decimal.js";
import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { LINE_TABLE_SCROLL_CLASS } from "@/kernel/core/components/ui/line-table-styles";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { formatNumber } from "@/kernel/core/lib/formatters";

import { useStockAvailability } from "@plugins/inventory/stock/hooks/useStockAvailability";
import { StockPermission } from "@plugins/inventory/stock/permissions/stock-permission.keys";
import { EstimateItemPicker } from "@plugins/sales/estimate/components/EstimateItemPicker";
import {
  BOM_QUANTITY_DECIMALS,
  ESTIMATE_NOTE_MAX,
  MONEY_DECIMALS,
} from "@plugins/sales/estimate/constants";
import {
  draftKey,
  type Drafts,
} from "@plugins/sales/estimate/utils/estimate-drafts";
import {
  bomLineAmount,
  toDecimal,
} from "@plugins/sales/estimate/utils/estimate-totals";

import type { EstimateEditor } from "@plugins/sales/estimate/hooks/useEstimateEditor";
import type {
  EstimateBomLine,
  EstimatePanel,
} from "@plugins/sales/estimate/types";

const CELL = "border-b border-border-secondary px-2 py-1.5 align-middle";
const HEAD =
  "border-b border-border-secondary bg-surface-secondary px-2 py-2 text-left text-xs font-semibold uppercase text-text-tertiary";
const NUMBER_CELL = `${CELL} text-right tabular-nums`;
/** Read-only stock columns, in the order `stockCells` fills them. */
const STOCK_COLUMNS = ["onHand", "available", "short"] as const;

interface EstimateBomGridProps {
  panel: EstimatePanel;
  /** Every panel of the revision: an item's shortage counts what all of them need. */
  revisionPanels: readonly EstimatePanel[];
  editor: EstimateEditor;
  /** False for a submitted or superseded revision, or a reader without edit rights. */
  editable: boolean;
}

/**
 * What the revision needs of each item: Σ (BOM quantity × panel quantity) over every panel,
 * with the unsaved entries laid over the stored ones so the shortage follows what is typed.
 */
export function requiredByItem(
  panels: readonly EstimatePanel[],
  drafts: Drafts,
): Map<number, Decimal> {
  const required = new Map<number, Decimal>();
  for (const panel of panels) {
    const panelQuantity = toDecimal(
      drafts[`panel:${panel.id}:quantity`] ?? panel.quantity,
    );
    for (const line of panel.bomLines) {
      const need = toDecimal(
        drafts[`bom:${line.id}:quantity`] ?? line.quantity,
      ).mul(panelQuantity);
      required.set(
        line.itemId,
        (required.get(line.itemId) ?? new Decimal(0)).add(need),
      );
    }
  }
  return required;
}

/** The materials of one panel; each row's amount follows what is typed into it. */
export function EstimateBomGrid({
  panel,
  revisionPanels,
  editor,
  editable,
}: EstimateBomGridProps) {
  const t = useTranslations("estimate");
  const tCommon = useTranslations("common");
  const { can } = useAuth();
  const { drafts, setDraft, commit, edits } = editor;
  const [lineToRemove, setLineToRemove] = useState<EstimateBomLine | null>(
    null,
  );
  const quantityDigits = { maximumFractionDigits: BOM_QUANTITY_DECIMALS };
  const moneyDigits = { maximumFractionDigits: MONEY_DECIMALS };

  const showStock = can(StockPermission.availability);
  // One read for the whole revision, so switching panel tabs reuses the cached answer.
  const revisionItemIds = useMemo(
    () =>
      revisionPanels.flatMap((entry) =>
        entry.bomLines.map((line) => line.itemId),
      ),
    [revisionPanels],
  );
  const stock = useStockAvailability(revisionItemIds, showStock);
  const required = requiredByItem(revisionPanels, drafts);
  const columnCount = 8 + (showStock ? 3 : 0) + (editable ? 1 : 0);

  /** On hand, available and short of one item; a failed read shows a dash and blocks nothing. */
  const stockCells = (line: EstimateBomLine) => {
    if (stock.isLoading) {
      const placeholder = (
        <span
          className="inline-block h-3 w-10 animate-pulse rounded bg-surface-secondary"
          aria-label={t("bom.stockLoading")}
        />
      );
      return [placeholder, placeholder, placeholder];
    }
    const row = stock.byItem.get(line.itemId);
    if (stock.isError || !row) {
      return [t("emptyValue"), t("emptyValue"), t("emptyValue")];
    }
    const short = Decimal.max(
      0,
      (required.get(line.itemId) ?? new Decimal(0)).sub(row.available),
    );
    return [
      formatNumber(row.onHand, quantityDigits),
      formatNumber(row.available, quantityDigits),
      <span
        key="short"
        className={
          short.isZero() ? undefined : "font-semibold text-danger-text"
        }
      >
        {formatNumber(short.toNumber(), quantityDigits)}
      </span>,
    ];
  };

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
                {showStock ? (
                  <>
                    <th className={`${HEAD} text-right`}>{t("bom.onHand")}</th>
                    <th className={`${HEAD} text-right`}>
                      {t("bom.available")}
                    </th>
                    <th className={`${HEAD} text-right`}>{t("bom.short")}</th>
                  </>
                ) : null}
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
                    colSpan={columnCount}
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
                    {showStock
                      ? stockCells(line).map((content, index) => (
                          <td
                            key={STOCK_COLUMNS[index]}
                            className={NUMBER_CELL}
                            data-testid={`bom-stock-${STOCK_COLUMNS[index]}-${line.id}`}
                          >
                            {content}
                          </td>
                        ))
                      : null}
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
