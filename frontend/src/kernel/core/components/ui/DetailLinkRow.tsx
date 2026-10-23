"use client";

import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";

export interface DetailLinkRowProps {
  label: string;
  url?: string | null;
  emptyLabel: string;
  /** Text of the anchor that opens the URL. */
  openLabel: string;
}

/** The host a URL points at, e.g. `drive.google.com`, or the raw value when it is not a URL. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * A stored URL on a detail page: a link icon, the field label, and the host it points at, with
 * one action that opens it. A file attachment uses `DetailDocRow`, whose document icon marks it
 * as something stored rather than something linked.
 */
export function DetailLinkRow({
  label,
  url,
  emptyLabel,
  openLabel,
}: Readonly<DetailLinkRowProps>) {
  const trimmed = url?.trim() || "";

  if (!trimmed) {
    return (
      <div className="flex flex-col gap-2.5 rounded-lg border border-border-secondary bg-surface-primary p-3">
        <div className="flex items-center gap-1.5">
          <Icon name="link" size={18} className="shrink-0 text-sky-600" />
          <span className="text-sm font-medium text-text-primary">{label}</span>
        </div>
        <span className="text-sm text-text-secondary">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-secondary bg-surface-primary p-3">
      <Icon name="link" size={20} className="shrink-0 text-sky-600" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">
          {label}
        </div>
        <div className="truncate text-xs text-text-secondary" title={trimmed}>
          {hostLabel(trimmed)}
        </div>
      </div>
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-border-secondary bg-surface-primary px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary"
      >
        <Icon name="arrow-up-right" size={14} />
        {openLabel}
      </a>
    </div>
  );
}
