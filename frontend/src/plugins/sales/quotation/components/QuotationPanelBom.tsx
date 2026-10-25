"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { LINE_TABLE_SCROLL_CLASS } from "@/kernel/core/components/ui/line-table-styles";
import { formatNumber } from "@/kernel/core/lib/formatters";

import { BOM_QUANTITY_DECIMALS } from "@plugins/sales/estimate/constants";

import type { QuotationLine } from "@plugins/sales/quotation/types";

const CELL = "border-b border-border-secondary px-2 py-1.5 align-middle";
const HEAD =
  "border-b border-border-secondary bg-surface-secondary px-2 py-2 text-left text-xs font-semibold uppercase text-text-tertiary";

/**
 * The materials of one panel as the customer reads them on the quotation, and the names of
 * its other cost lines. Read-only on every version: it is frozen when the version is created.
 */
export function QuotationPanelBom({ line }: { line: QuotationLine }) {
  const t = useTranslations("quotation");
  const tEstimate = useTranslations("estimate");

  if (line.bomLines.length === 0 && line.costLines.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid={`panel-bom-${line.id}`}>
      <div className={LINE_TABLE_SCROLL_CLASS}>
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={`${HEAD} w-12`}>{t("bom.position")}</th>
              <th className={HEAD}>{t("bom.description")}</th>
              <th className={HEAD}>{t("bom.code")}</th>
              <th className={HEAD}>{t("bom.brand")}</th>
              <th className={HEAD}>{t("bom.unit")}</th>
              <th className={`${HEAD} text-right`}>{t("bom.quantity")}</th>
            </tr>
          </thead>
          <tbody>
            {line.bomLines.map((bom, index) => (
              <tr key={bom.id}>
                <td className={CELL}>{index + 1}</td>
                <td className={CELL}>{bom.itemName}</td>
                <td className={`${CELL} font-mono`}>{bom.itemCode}</td>
                <td className={CELL}>{bom.itemBrand || t("emptyValue")}</td>
                <td className={CELL}>{bom.itemUnit}</td>
                <td className={`${CELL} text-right tabular-nums`}>
                  {formatNumber(bom.quantity, {
                    maximumFractionDigits: BOM_QUANTITY_DECIMALS,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {line.costLines.length > 0 ? (
        <p className="text-sm text-text-secondary">
          {line.costLines
            .map((cost) =>
              cost.description
                ? `${tEstimate(`categories.${cost.category}`)}: ${cost.description}`
                : tEstimate(`categories.${cost.category}`),
            )
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
