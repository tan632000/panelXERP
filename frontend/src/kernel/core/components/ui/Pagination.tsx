"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";
import { buildPaginationItems, PAGE_GAP } from "@/kernel/core/lib/pagination";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  /**
   * Replaces the count sentence entirely, for a list whose caption is not "N of M
   * `itemLabel`".
   */
  caption?: React.ReactNode;
  /**
   * Set on a list paged by document that draws each document's lines, one per row: the range
   * and total count documents (`itemLabel`), and this is how many lines the page draws for
   * them — e.g. "documents 1–25 (150 lines) · 108 documents in total".
   */
  lineCount?: number;
  /** Names the lines of `lineCount`; defaults to material lines. */
  lineLabel?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  itemLabel,
  caption,
  lineCount,
  lineLabel,
}: PaginationProps) {
  const t = useTranslations("common");
  const label = itemLabel ?? t("results");
  const buildCountText = () => {
    if (caption !== undefined && caption !== null) return caption;
    if (lineCount !== undefined) {
      return t("showingDocumentPage", {
        itemLabel: label,
        start: totalItems === 0 ? 0 : startIndex + 1,
        end: endIndex,
        total: totalItems,
        lines: lineCount,
        lineLabel: lineLabel ?? t("documentLineLabel"),
      });
    }
    if (totalPages <= 1) {
      return t("showingAll", { total: totalItems, itemLabel: label });
    }
    return t("showingRange", {
      start: startIndex + 1,
      end: endIndex,
      total: totalItems,
      itemLabel: label,
    });
  };
  const countText = buildCountText();

  return (
    <div className="mt-[11px] flex items-center justify-between text-sm text-text-secondary max-lg:flex-wrap max-lg:gap-2">
      <span>{countText}</span>
      {totalPages > 1 && (
        <div className="flex gap-1">
          <button
            type="button"
            className={cn(
              "inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-border-secondary bg-surface-primary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:cursor-default disabled:opacity-50 [font-family:inherit]",
              "rounded-md px-3 py-1.5 text-sm",
            )}
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <Icon name="chevron-left" size={16} />
          </button>
          {buildPaginationItems(currentPage, totalPages).map((item, index) =>
            item === PAGE_GAP ? (
              // The skipped pages are reachable through the page beside the gap, so the gap
              // itself is a mark rather than a control: nothing here is worth a tab stop.
              <span
                // Both gaps carry the same value, so the slot is what tells them apart.
                key={`gap-${index}`}
                aria-hidden
                className="inline-flex items-center px-1.5 text-sm text-text-tertiary"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-current={currentPage === item ? "page" : undefined}
                className={
                  currentPage === item
                    ? "inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-md border border-brand bg-brand px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-default disabled:opacity-50 [font-family:inherit]"
                    : "inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-md border border-border-secondary bg-surface-primary px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:cursor-default disabled:opacity-50 [font-family:inherit]"
                }
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className={cn(
              "inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-border-secondary bg-surface-primary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:cursor-default disabled:opacity-50 [font-family:inherit]",
              "rounded-md px-3 py-1.5 text-sm",
            )}
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
