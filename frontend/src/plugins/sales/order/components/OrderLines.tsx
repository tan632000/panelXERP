"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { DetailTotalsSummary } from "@/kernel/core/components/ui/DetailTotalsSummary";
import { LINE_TABLE_SCROLL_CLASS } from "@/kernel/core/components/ui/line-table-styles";
import { formatCurrency, formatNumber } from "@/kernel/core/lib/formatters";

import { BOM_QUANTITY_DECIMALS } from "@plugins/sales/estimate/constants";
import { toRoman } from "@plugins/sales/quotation/utils/quotation-pricing";

import type { OrderDetail } from "@plugins/sales/order/types";

const CELL = "border-b border-border-secondary px-2 py-1.5 align-middle";
const HEAD =
  "border-b border-border-secondary bg-surface-secondary px-2 py-2 text-left text-xs font-semibold uppercase text-text-tertiary";
const NUMBER_CELL = `${CELL} text-right tabular-nums`;

/**
 * The panels of the order with their materials, the totals and the payment terms, all as
 * copied from the confirmed quotation version. Nothing here is editable.
 */
export function OrderLines({ order }: { order: OrderDetail }) {
  const t = useTranslations("order");

  return (
    <>
      <DetailSection title={t("lines.title")}>
        <div className={LINE_TABLE_SCROLL_CLASS}>
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={`${HEAD} w-12`}>{t("lines.position")}</th>
                <th className={HEAD}>{t("lines.panel")}</th>
                <th className={`${HEAD} text-right`}>{t("lines.quantity")}</th>
                <th className={`${HEAD} text-right`}>{t("lines.unitPrice")}</th>
                <th className={`${HEAD} text-right`}>{t("lines.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line, index) => (
                <React.Fragment key={line.id}>
                  <tr>
                    <td className={CELL}>{toRoman(index + 1)}</td>
                    <td className={CELL}>
                      <span className="font-semibold">{line.tag}</span>
                      {line.description ? (
                        <span className="block text-text-secondary">
                          {line.description}
                        </span>
                      ) : null}
                    </td>
                    <td className={NUMBER_CELL}>{line.quantity}</td>
                    <td className={NUMBER_CELL}>
                      {formatCurrency(line.unitPrice)}
                    </td>
                    <td className={`${NUMBER_CELL} font-semibold`}>
                      {formatCurrency(line.amount)}
                    </td>
                  </tr>
                  {line.bomLines.map((bom) => (
                    <tr key={bom.id} data-testid={`order-bom-${bom.id}`}>
                      <td className={CELL} />
                      <td
                        className={`${CELL} pl-6 text-text-secondary`}
                        colSpan={2}
                      >
                        {`${bom.itemName} · ${bom.itemCode}`}
                        {bom.itemBrand ? ` · ${bom.itemBrand}` : ""}
                      </td>
                      <td className={`${NUMBER_CELL} text-text-secondary`}>
                        {bom.itemUnit}
                      </td>
                      <td className={`${NUMBER_CELL} text-text-secondary`}>
                        {formatNumber(bom.quantity, {
                          maximumFractionDigits: BOM_QUANTITY_DECIMALS,
                        })}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-3 w-full max-w-xl">
          <DetailTotalsSummary
            rows={[
              {
                key: "subtotal",
                label: t("totals.subtotal"),
                amount: order.subtotal,
              },
              {
                key: "discount",
                label: t("totals.discount"),
                amount: order.discountAmount,
                effect: "subtracted",
              },
              {
                key: "taxable",
                label: t("totals.taxable"),
                amount: order.taxable,
              },
              {
                key: "vat",
                label: t("totals.vat", { rate: order.vatRate }),
                amount: order.vatAmount,
                effect: "added",
              },
            ]}
            total={{ label: t("totals.total"), amount: order.total }}
          />
        </div>
      </DetailSection>

      {order.terms.length > 0 ? (
        <DetailSection title={t("terms")}>
          <ol className="list-decimal pl-5 text-sm">
            {order.terms.map((term, index) => (
              <li key={`${index}-${term}`}>{term}</li>
            ))}
          </ol>
        </DetailSection>
      ) : null}
    </>
  );
}
