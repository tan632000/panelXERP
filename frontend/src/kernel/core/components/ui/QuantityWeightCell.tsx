"use client";

import React from "react";

import { cn } from "@kernel/core/lib/cn";
import { formatNumber } from "@kernel/core/lib/formatters";

/**
 * How the figure reads: an ordinary quantity, good output, or rejected output.
 *
 * Never derived from the number itself — the same 200 pcs is neutral on an issued column and
 * alarming on an NG one, and only the caller knows which column it is drawing.
 */
export type QuantityWeightTone = "default" | "positive" | "negative";

export interface QuantityWeightCellProps {
  quantityPcs?: number | null;
  weightKg?: number | null;
  /** Unit printed after the count. Defaults to `pcs`, the unit every stock column uses. */
  quantityUnit?: string;
  /** Unit printed after the weight. Defaults to `kg`. */
  weightUnit?: string;
  tone?: QuantityWeightTone;
  /** Replaces the tone's colour on the piece-count line, e.g. a bold amber "exported" column. */
  quantityClassName?: string;
  className?: string;
}

const TONE_CLASS: Record<QuantityWeightTone, string> = {
  default: "text-text-primary",
  positive: "text-success-text",
  negative: "text-danger-text",
};

/** Weights carry up to three decimals; a count never does. */
const WEIGHT_FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 3 };

/**
 * A stock figure as the list screens draw it: the piece count on the first line and the weight
 * it represents underneath, both right-aligned.
 *
 * Lives in the kernel because "how much of this, in pieces and in kilograms" is not one
 * feature's idea — every warehouse, production and packaging list states a quantity that way,
 * and a private copy per feature would drift in alignment, units and decimal places.
 */
export function QuantityWeightCell({
  quantityPcs,
  weightKg,
  quantityUnit = "pcs",
  weightUnit = "kg",
  tone = "default",
  quantityClassName,
  className,
}: Readonly<QuantityWeightCellProps>) {
  return (
    <div className={cn("flex flex-col gap-[2px] text-right", className)}>
      <span
        className={cn(
          "whitespace-nowrap",
          quantityClassName ?? TONE_CLASS[tone],
        )}
      >
        {formatNumber(quantityPcs ?? 0)} {quantityUnit}
      </span>
      <span className="whitespace-nowrap text-[10px] text-text-secondary">
        {formatNumber(weightKg ?? 0, WEIGHT_FORMAT)} {weightUnit}
      </span>
    </div>
  );
}
