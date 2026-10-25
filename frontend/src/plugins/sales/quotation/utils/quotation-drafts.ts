import { Decimal } from "decimal.js";

import {
  DISCOUNT_MAX_PERCENT,
  MARGIN_MAX_PERCENT,
  MONEY_DECIMALS,
  PERCENT_DECIMALS,
  type DiscountType,
} from "@plugins/sales/quotation/constants";

/**
 * What is typed into the margin, discount and VAT fields and not saved yet. The server keeps
 * the saved figures and re-validates every one; these checks only decide whether Save is
 * offered and which field to flag.
 */
export interface PricingDraft {
  /** Margin per line id, as typed. */
  margins: Readonly<Record<number, string>>;
  discountType: DiscountType;
  discountValue: string;
  vatRate: string;
}

function parseBounded(
  raw: string,
  max: number | null,
  decimals: number,
): number | null {
  if (raw.trim() === "") return null;
  let value: Decimal;
  try {
    value = new Decimal(raw);
  } catch {
    return null;
  }
  if (!value.isFinite() || value.isNegative()) return null;
  if (value.decimalPlaces() > decimals) return null;
  if (max !== null && value.gt(max)) return null;
  return value.toNumber();
}

/** A margin the server accepts: 0 to 1000, up to 2 decimals; `null` when it is not one. */
export function parseMargin(raw: string): number | null {
  return parseBounded(raw, MARGIN_MAX_PERCENT, PERCENT_DECIMALS);
}

/** A discount the server accepts for its type; `null` when it is not one. */
export function parseDiscount(raw: string, type: DiscountType): number | null {
  return type === "percent"
    ? parseBounded(raw, DISCOUNT_MAX_PERCENT, PERCENT_DECIMALS)
    : parseBounded(raw, null, MONEY_DECIMALS);
}
