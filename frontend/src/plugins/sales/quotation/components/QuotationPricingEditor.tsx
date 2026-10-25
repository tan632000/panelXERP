"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { LINE_TABLE_SCROLL_CLASS } from "@/kernel/core/components/ui/line-table-styles";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { formatCurrency, formatNumber } from "@/kernel/core/lib/formatters";

import {
  PERCENT_DECIMALS,
  type DiscountType,
} from "@plugins/sales/quotation/constants";
import {
  parseDiscount,
  parseMargin,
} from "@plugins/sales/quotation/utils/quotation-drafts";
import {
  computeQuotationFigures,
  toRoman,
} from "@plugins/sales/quotation/utils/quotation-pricing";

import { QuotationPanelBom } from "./QuotationPanelBom";
import { QuotationTotals } from "./QuotationTotals";

import type {
  QuotationVersion,
  UpdateQuotationPricingDto,
} from "@plugins/sales/quotation/types";

const CELL = "border-b border-border-secondary px-2 py-1.5 align-middle";
const HEAD =
  "border-b border-border-secondary bg-surface-secondary px-2 py-2 text-left text-xs font-semibold uppercase text-text-tertiary";
const NUMBER_CELL = `${CELL} text-right tabular-nums`;

interface QuotationPricingEditorProps {
  version: QuotationVersion;
  /** False for a version that is not a draft, or a reader without edit rights. */
  editable: boolean;
  saving: boolean;
  onSave: (dto: UpdateQuotationPricingDto) => void;
}

/**
 * One section per panel (Roman-numbered as in the company quotation) with its quantity,
 * margin, unit price and amount, the panel's materials beneath it, and the totals. In a draft
 * every figure is computed here from what is typed and is for reference only; Save sends the
 * margins, discount and VAT, and the server's stored totals replace them.
 */
export function QuotationPricingEditor({
  version,
  editable,
  saving,
  onSave,
}: QuotationPricingEditorProps) {
  const t = useTranslations("quotation");

  const saved = useMemo(
    () => ({
      margins: Object.fromEntries(
        version.lines.map((line) => [line.id, String(line.marginPercent)]),
      ) as Record<number, string>,
      discountType: version.discountType,
      discountValue: String(version.discountValue),
      vatRate: String(version.vatRate),
    }),
    [version],
  );
  const [margins, setMargins] = useState<Record<number, string>>(saved.margins);
  const [discountType, setDiscountType] = useState<DiscountType>(
    saved.discountType,
  );
  const [discountValue, setDiscountValue] = useState(saved.discountValue);
  const [vatRate, setVatRate] = useState(saved.vatRate);

  const marginErrors = new Set(
    version.lines
      .filter((line) => parseMargin(margins[line.id] ?? "") === null)
      .map((line) => line.id),
  );
  const parsedDiscount = parseDiscount(discountValue, discountType);

  const live = computeQuotationFigures({
    lines: version.lines.map((line) => ({
      unitCost: line.unitCost,
      marginPercent: margins[line.id] ?? line.marginPercent,
      quantity: line.quantity,
    })),
    discountType,
    discountValue,
    vatRate,
  });

  let discountError: string | null = null;
  if (parsedDiscount === null) {
    discountError = t(
      discountType === "percent"
        ? "validation.discountPercentInvalid"
        : "validation.discountInvalid",
    );
  } else if (live.discountTooLarge) {
    discountError = t("validation.discountTooLarge");
  }

  const changedLines = version.lines.filter(
    (line) => margins[line.id] !== saved.margins[line.id],
  );
  const dirty =
    changedLines.length > 0 ||
    discountType !== saved.discountType ||
    discountValue !== saved.discountValue ||
    vatRate !== saved.vatRate;
  const valid = marginErrors.size === 0 && discountError === null;

  const save = () => {
    onSave({
      lines: version.lines.map((line) => ({
        lineId: line.id,
        marginPercent: parseMargin(margins[line.id] ?? "") ?? 0,
      })),
      discountType,
      discountValue: parsedDiscount ?? 0,
      vatRate: Number(vatRate),
    });
  };

  const figures = editable
    ? live
    : {
        lines: version.lines,
        subtotal: version.subtotal,
        discountAmount: version.discountAmount,
        taxable: version.taxable,
        vatAmount: version.vatAmount,
        total: version.total,
      };

  return (
    <DetailSection
      title={t("panels.title")}
      action={
        editable ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 rounded-[7px] border border-brand bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!dirty || !valid || saving}
            onClick={save}
          >
            {t("pricing.save")}
          </button>
        ) : null
      }
    >
      <div className="flex flex-col gap-5">
        {version.lines.map((line, index) => {
          const priced = figures.lines[index];
          return (
            <section
              key={line.id}
              className="flex flex-col gap-2"
              data-testid={`panel-${line.id}`}
            >
              <div className={LINE_TABLE_SCROLL_CLASS}>
                <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className={`${HEAD} w-12`}>{t("panels.position")}</th>
                      <th className={HEAD}>{t("panels.panel")}</th>
                      <th className={`${HEAD} text-right`}>
                        {t("panels.quantity")}
                      </th>
                      <th className={`${HEAD} text-right`}>
                        {t("panels.unitCost")}
                      </th>
                      <th className={`${HEAD} text-right`}>
                        {t("panels.margin")}
                      </th>
                      <th className={`${HEAD} text-right`}>
                        {t("panels.unitPrice")}
                      </th>
                      <th className={`${HEAD} text-right`}>
                        {t("panels.amount")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={`${CELL} font-semibold`}>
                        {toRoman(index + 1)}
                      </td>
                      <td className={CELL}>
                        <div className="font-semibold text-text-primary">
                          {line.tag}
                        </div>
                        {line.description ? (
                          <div className="text-text-secondary">
                            {line.description}
                          </div>
                        ) : null}
                      </td>
                      <td className={NUMBER_CELL}>{line.quantity}</td>
                      <td className={NUMBER_CELL}>
                        {formatCurrency(line.unitCost)}
                      </td>
                      <td className={NUMBER_CELL}>
                        {editable ? (
                          <NumberInput
                            aria-label={t("panels.marginOf", { tag: line.tag })}
                            aria-invalid={marginErrors.has(line.id)}
                            error={marginErrors.has(line.id)}
                            className="w-24 text-right"
                            value={margins[line.id] ?? ""}
                            decimalScale={PERCENT_DECIMALS}
                            allowNegative={false}
                            onChange={(event) =>
                              setMargins((previous) => ({
                                ...previous,
                                [line.id]: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          `${formatNumber(line.marginPercent, { maximumFractionDigits: PERCENT_DECIMALS })}%`
                        )}
                      </td>
                      <td
                        className={`${NUMBER_CELL} font-semibold`}
                        data-testid={`unit-price-${line.id}`}
                      >
                        {formatCurrency(priced.unitPrice)}
                      </td>
                      <td
                        className={`${NUMBER_CELL} font-semibold`}
                        data-testid={`amount-${line.id}`}
                      >
                        {formatCurrency(priced.amount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <QuotationPanelBom line={line} />
            </section>
          );
        })}

        <QuotationTotals
          editable={editable}
          discountType={editable ? discountType : version.discountType}
          discountValue={editable ? discountValue : version.discountValue}
          vatRate={editable ? vatRate : version.vatRate}
          subtotal={figures.subtotal}
          discountAmount={figures.discountAmount}
          taxable={figures.taxable}
          vatAmount={figures.vatAmount}
          total={figures.total}
          discountError={editable ? discountError : null}
          onDiscountType={setDiscountType}
          onDiscountValue={setDiscountValue}
          onVatRate={setVatRate}
        />
      </div>
    </DetailSection>
  );
}
