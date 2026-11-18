"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { IconToolButton } from "@/kernel/core/components/ui/IconToolButton";
import { cn } from "@/kernel/core/lib/cn";

import { QC_CHECKLIST_NAME_MAX } from "@plugins/delivery/qc-checklist/constants";

import type { QcChecklistItem } from "@plugins/delivery/qc-checklist/types";

interface Props {
  item: QcChecklistItem;
  index: number;
  isLast: boolean;
  canManage: boolean;
  busy: boolean;
  onMove: (offset: -1 | 1) => void;
  onToggle: () => void;
  /** Saves a new name; `done` closes the inline editor once the server took it. */
  onRename: (name: string, done: () => void) => void;
}

const SMALL_BUTTON =
  "h-8 rounded-[7px] border border-border-secondary px-3 text-sm font-semibold hover:bg-surface-secondary disabled:opacity-50";

/** One checklist item: its position and name, a badge when hidden, and the manager's controls. */
export function ChecklistItemRow({
  item,
  index,
  isLast,
  canManage,
  busy,
  onMove,
  onToggle,
  onRename,
}: Readonly<Props>) {
  const t = useTranslations("delivery.checklist");
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const next = (draft ?? "").trim();

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border-secondary bg-surface-primary px-3 py-2",
        !item.active && "bg-surface-secondary text-text-secondary",
      )}
    >
      <span className="w-6 shrink-0 text-right font-mono text-sm text-text-secondary">
        {index + 1}
      </span>
      {editing ? (
        <div className="flex-1">
          <FormInput
            label={t("rename")}
            labelHidden
            maxLength={QC_CHECKLIST_NAME_MAX}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
      ) : (
        <span data-testid="item-name" className="flex-1">
          {item.name}
        </span>
      )}
      {item.active ? null : (
        <span data-testid="hidden-badge" className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs font-semibold text-text-secondary">
          {t("hiddenBadge")}
        </span>
      )}
      {canManage && editing ? (
        <>
            <Button
              disabled={next === "" || busy}
              onClick={() => onRename(next, () => setDraft(null))}
            >
              {t("save")}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {t("cancel")}
            </Button>
        </>
      ) : null}
      {canManage && !editing ? (
          <>
            <IconToolButton
              icon="chevron-up"
              label={t("moveUp", { name: item.name })}
              disabled={index === 0 || busy}
              onClick={() => onMove(-1)}
            />
            <IconToolButton
              icon="chevron-down"
              label={t("moveDown", { name: item.name })}
              disabled={isLast || busy}
              onClick={() => onMove(1)}
            />
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() => setDraft(item.name)}
            >
              {t("rename")}
            </button>
            <button
              type="button"
              className={SMALL_BUTTON}
              disabled={busy}
              onClick={onToggle}
            >
              {item.active ? t("hide") : t("show")}
            </button>
          </>
      ) : null}
    </li>
  );
}
