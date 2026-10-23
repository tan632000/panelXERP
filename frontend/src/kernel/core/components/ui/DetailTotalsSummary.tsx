"use client";

import React from "react";

import { cn } from "@/kernel/core/lib/cn";
import { formatAmountWithCurrency } from "@/kernel/core/lib/formatters";

export interface DetailTotalsRow {
  key: string;
  label: string;
  amount: number;
  /**
   * How the figure acts on the total, which is what its sign and colour say.
   * `subtracted` reads `-X` in red, `added` reads `+X`; a zero always reads plainly, because
   * "-0" states a deduction that did not happen.
   */
  effect?: "subtracted" | "added";
}

export interface DetailTotalsSummaryProps {
  rows: readonly DetailTotalsRow[];
  total: { label: string; amount: number };
  /** Suffix every figure carries, e.g. `VND`. */
  currency?: string;
  /** Slot above the separator, for a figure only one screen has. */
  extra?: React.ReactNode;
}

/**
 * The money summary a document's detail closes with: the components stacked in one panel,
 * each signed by how it moves the total, then the total itself set apart below a rule.
 *
 * A grid of equal-looking fields cannot say any of that — it leaves the reader to work out
 * which figures were added and which taken off, and reads the total as just another cell.
 * This mirrors the mock's shared `_totalsSummaryHTML`, so every document that closes with
 * money closes the same way.
 *
 * Feature-agnostic: the rows, their labels and the currency all arrive as props.
 */
export function DetailTotalsSummary({
  rows,
  total,
  currency = "VND",
  extra,
}: Readonly<DetailTotalsSummaryProps>) {
  const money = (amount: number) => formatAmountWithCurrency(amount, currency);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-surface-secondary px-3.5 py-2.5">
      {rows.map((row) => {
        const isDeduction = row.effect === "subtracted" && row.amount !== 0;
        // A zero reads plainly whatever its effect: "-0" states a deduction that never
        // happened. Built as one string so the cell is one text node to read and to assert on.
        const signed = (() => {
          if (row.amount === 0) return money(row.amount);
          if (row.effect === "subtracted") return `-${money(row.amount)}`;
          if (row.effect === "added") return `+${money(row.amount)}`;
          return money(row.amount);
        })();

        return (
          <div key={row.key} className="flex justify-between gap-4">
            <span className="text-xs text-text-secondary">{row.label}</span>
            <span
              className={cn(
                "text-[13px] font-semibold tabular-nums",
                isDeduction ? "text-danger-text" : "text-text-primary",
              )}
            >
              {signed}
            </span>
          </div>
        );
      })}

      {extra}

      <div className="mt-0.5 flex items-center justify-between gap-4 border-t border-border-secondary pt-2">
        <span className="text-xs font-semibold text-text-secondary">
          {total.label}
        </span>
        <span className="text-[17px] font-bold tabular-nums text-success-text">
          {money(total.amount)}
        </span>
      </div>
    </div>
  );
}
