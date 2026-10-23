"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";
import {
  getDocumentIconClassName,
  getDocumentIconName,
} from "@/kernel/core/lib/files";

export interface DetailDocRowProps {
  label: string;
  fileName?: string | null;
  emptyLabel: string;
  /** Leading glyph. Defaults to a document; an attachment row uses a paperclip. */
  icon?: string;
  safety?: boolean;
  viewing?: boolean;
  downloading?: boolean;
  onView: () => void;
  /** Omitted where the storage link carries no separate download disposition. */
  onDownload?: () => void;
}

const docActionButtonClass =
  "inline-flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-md border border-border-secondary bg-surface-primary text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60";

export function DetailDocRow({
  label,
  fileName,
  emptyLabel,
  icon = "file-text",
  safety = false,
  viewing = false,
  downloading = false,
  onView,
  onDownload,
}: Readonly<DetailDocRowProps>) {
  const tCommon = useTranslations("common");
  const trimmed = fileName?.trim() || "";
  const hasFile = Boolean(trimmed);

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border-secondary bg-surface-primary p-3">
      <div className="flex items-center gap-1.5">
        <Icon
          name={safety ? "alert-triangle" : icon}
          size={18}
          className={cn("shrink-0", safety ? "text-amber-600" : "text-sky-600")}
        />
        <span className="text-sm font-medium text-text-primary">{label}</span>
      </div>

      {hasFile ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border-secondary bg-surface-secondary/40 px-2.5 py-1.5 text-sm text-text-primary"
            title={trimmed}
          >
            <Icon
              name={getDocumentIconName(trimmed)}
              size={14}
              className={cn("shrink-0", getDocumentIconClassName(trimmed))}
            />
            <span className="truncate">{trimmed}</span>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onView}
              disabled={viewing || downloading}
              title={tCommon("view")}
              aria-label={tCommon("view")}
              className={docActionButtonClass}
            >
              <Icon name="eye" size={15} />
            </button>
            {onDownload ? (
              <button
                type="button"
                onClick={onDownload}
                disabled={viewing || downloading}
                title={tCommon("download")}
                aria-label={tCommon("download")}
                className={docActionButtonClass}
              >
                <Icon name="download" size={15} />
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <span className="text-sm text-text-secondary">{emptyLabel}</span>
      )}
    </div>
  );
}
