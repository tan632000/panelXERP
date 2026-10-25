"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { formatCurrency, formatNumber } from "@/kernel/core/lib/formatters";

import {
  DISCOUNT_MAX_PERCENT,
  DISCOUNT_TYPES,
  MONEY_DECIMALS,
  PERCENT_DECIMALS,
  VAT_RATES,
  type DiscountType,
} from "@plugins/sales/quotation/constants";

interface QuotationTotalsProps {
  /** False for a version that is not a draft, or a reader without edit rights. */
  editable: boolean;
  discountType: DiscountType;
  /** What is typed (editable) or stored (read-only). */
  discountValue: string | number;
  vatRate: string | number;
  subtotal: number;
  discountAmount: number;
  taxable: number;
  vatAmount: number;
  total: number;
  discountError?: string | null;
  onDiscountType: (type: DiscountType) => void;
  onDiscountValue: (value: string) => void;
  onVatRate: (rate: string) => void;
}

const ROW = "flex items-center justify-between gap-4 py-1.5 text-sm";
const AMOUNT = "min-w-36 text-right font-semibold tabular-nums";

/**
 * The totals under the panels: subtotal, the discount (a percent or a fixed amount), the
 * taxable amount, one VAT rate and the total. In a draft the figures are computed from what
 * is typed and are for reference; the server stores its own on save.
 */
export function QuotationTotals({
  editable,
  discountType,
  discountValue,
  vatRate,
  subtotal,
  discountAmount,
  taxable,
  vatAmount,
  total,
  discountError,
  onDiscountType,
  onDiscountValue,
  onVatRate,
}: QuotationTotalsProps) {
  const t = useTranslations("quotation");

  return (
    <div className="ml-auto flex w-full max-w-xl flex-col rounded-lg border border-border-secondary p-3">
      <div className={ROW}>
        <span className="text-text-secondary">{t("pricing.subtotal")}</span>
        <span className={AMOUNT} data-testid="quotation-subtotal">
          {formatCurrency(subtotal)}
        </span>
      </div>

      <div className={ROW}>
        <span className="text-text-secondary">{t("pricing.discount")}</span>
        <div className="flex items-center gap-2">
          {editable ? (
            <>
              <FormSelect
                label={t("pricing.discountType")}
                labelHidden
                searchable={false}
                className="w-32"
                options={DISCOUNT_TYPES.map((type) => ({
                  value: type,
                  label: t(`pricing.discountTypes.${type}`),
                }))}
                value={discountType}
                onChange={(event) =>
                  onDiscountType(event.target.value as DiscountType)
                }
              />
              <NumberInput
                aria-label={t("pricing.discountValue")}
                className="w-32 text-right"
                value={discountValue}
                decimalScale={
                  discountType === "percent" ? PERCENT_DECIMALS : MONEY_DECIMALS
                }
                allowNegative={false}
                onChange={(event) => onDiscountValue(event.target.value)}
              />
            </>
          ) : (
            <span className="text-text-secondary">
              {discountType === "percent"
                ? `${formatNumber(Number(discountValue), { maximumFractionDigits: PERCENT_DECIMALS })}%`
                : t("pricing.discountTypes.amount")}
            </span>
          )}
          <span
            className="min-w-36 text-right font-semibold tabular-nums"
            data-testid="quotation-discount"
          >
            {formatCurrency(discountAmount)}
          </span>
        </div>
      </div>
      {discountError ? (
        <p className="text-right text-xs text-danger-text" role="alert">
          {discountError}
        </p>
      ) : null}

      <div className={ROW}>
        <span className="text-text-secondary">{t("pricing.taxable")}</span>
        <span className={AMOUNT} data-testid="quotation-taxable">
          {formatCurrency(taxable)}
        </span>
      </div>

      <div className={ROW}>
        <span className="text-text-secondary">{t("pricing.vat")}</span>
        <div className="flex items-center gap-2">
          {editable ? (
            <FormSelect
              label={t("pricing.vatRate")}
              labelHidden
              searchable={false}
              className="w-24"
              options={VAT_RATES.map((rate) => ({
                value: String(rate),
                label: `${rate}%`,
              }))}
              value={String(vatRate)}
              onChange={(event) => onVatRate(event.target.value)}
            />
          ) : (
            <span className="text-text-secondary">{`${vatRate}%`}</span>
          )}
          <span
            className="min-w-36 text-right font-semibold tabular-nums"
            data-testid="quotation-vat"
          >
            {formatCurrency(vatAmount)}
          </span>
        </div>
      </div>

      <div className={`${ROW} border-t border-border-secondary pt-2`}>
        <span className="font-semibold text-text-primary">
          {t("pricing.total")}
        </span>
        <span
          className="min-w-36 text-right text-base font-bold tabular-nums"
          data-testid="quotation-total"
        >
          {formatCurrency(total)}
        </span>
      </div>
      {editable ? (
        <p className="mt-1 text-xs text-text-tertiary">
          {t("pricing.hint", { max: DISCOUNT_MAX_PERCENT })}
        </p>
      ) : null}
    </div>
  );
}
