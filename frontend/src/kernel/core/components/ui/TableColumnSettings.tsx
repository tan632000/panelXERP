"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@kernel/core/components/ui/Icon";
import { cn } from "@kernel/core/lib/cn";

const POPOVER_WIDTH_PX = 268;
const POPOVER_MAX_HEIGHT_PX = 360;
const POPOVER_GAP_PX = 4;
const POPOVER_Z_INDEX = 600;

interface PopoverPosition {
  top: number;
  left: number;
}

/** One column the popup offers, in the order the table declares it. */
export interface TableColumnSettingsOption {
  key: string;
  label: string;
}

export interface TableColumnSettingsProps {
  options: TableColumnSettingsOption[];
  /** Keys currently shown; every other option is hidden. */
  visibleKeys: string[];
  onToggle: (key: string) => void;
  onShowAll: () => void;
  /** Hides every column but the first, which the table cannot do without. */
  onHideAll: () => void;
  /** Last column pinned while scrolling sideways, or null when nothing is frozen. */
  frozenKey?: string | null;
  /** Freezes up to this column, or unfreezes when given null. */
  onFreeze?: (key: string | null) => void;
}

/**
 * The settings control of a list table: which columns this account wants to see.
 *
 * It sits in its own trailing header cell, so every list carries it in the same place. The
 * choice is stored per account as it is made, which is why there is no apply button — the
 * popup writes straight through the controller it is given.
 */
export function TableColumnSettings({
  options,
  visibleKeys,
  onToggle,
  onShowAll,
  onHideAll,
  frozenKey = null,
  onFreeze,
}: Readonly<TableColumnSettingsProps>) {
  const t = useTranslations("common.tableColumns");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hiddenCount = options.length - visibleKeys.length;
  const isLastVisible = visibleKeys.length <= 1;
  const showFreeze = Boolean(onFreeze);
  /**
   * How far the freeze reaches, counted over the shown columns: picking a column pins it
   * and everything before it, exactly as Excel freezes panes up to a chosen column.
   */
  const frozenReach = frozenKey ? visibleKeys.indexOf(frozenKey) : -1;

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  /** Anchored to the trigger and flipped above it when the popup would run off-screen. */
  const openPopover = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      // Opens rightwards from the trigger, over the list rather than over the sidebar,
      // and slides back only as far as the viewport edge forces it to.
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - POPOVER_WIDTH_PX - 8),
      );
      const fitsBelow =
        rect.bottom + POPOVER_GAP_PX + POPOVER_MAX_HEIGHT_PX <=
        window.innerHeight;
      const top = fitsBelow
        ? rect.bottom + POPOVER_GAP_PX
        : Math.max(8, rect.top - POPOVER_GAP_PX - POPOVER_MAX_HEIGHT_PX);
      setPosition({ top, left });
    }
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("settings")}
        aria-expanded={open}
        title={
          hiddenCount > 0
            ? t("hiddenCount", { count: hiddenCount })
            : t("settings")
        }
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded align-middle transition-colors",
          hiddenCount > 0
            ? "bg-brand px-1.5 py-0.5 text-white"
            : "p-1 text-text-secondary hover:bg-black/5 hover:text-text-primary",
          open && hiddenCount === 0 && "bg-black/5 text-text-primary",
        )}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          openPopover();
        }}
      >
        <Icon name="settings" size={16} />
        {hiddenCount > 0 ? (
          <span className="text-[11px] font-bold leading-none">
            {hiddenCount}
          </span>
        ) : null}
      </button>

      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={t("settings")}
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: POPOVER_WIDTH_PX,
                zIndex: POPOVER_Z_INDEX,
              }}
              className="flex flex-col overflow-hidden rounded-[9px] border border-border-secondary bg-surface-primary text-xs shadow-[0_10px_34px_rgba(15,23,42,0.18)]"
            >
              <div className="border-b border-border-tertiary px-3 py-2">
                <p className="font-semibold text-text-primary">{t("title")}</p>
                {showFreeze ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">
                    {frozenReach >= 0
                      ? t("frozenCount", { count: frozenReach + 1 })
                      : t("freezeHint")}
                  </p>
                ) : null}
              </div>

              <div className="scrollbar-thin max-h-[260px] overflow-y-auto py-1">
                {options.map((option) => {
                  const checked = visibleKeys.includes(option.key);
                  // The last shown column cannot be unticked: a table with no data column
                  // left would give the reader nothing to read and nothing to click.
                  const locked = checked && isLastVisible;

                  // Everything up to the chosen column is pinned with it, so each of those
                  // rows shows the state too rather than only the column that was picked.
                  const position = visibleKeys.indexOf(option.key);
                  const frozen =
                    checked && position >= 0 && position <= frozenReach;
                  const isFreezeEdge = option.key === frozenKey;

                  return (
                    <div
                      key={option.key}
                      className={cn(
                        "group/column flex items-center gap-2 px-3 py-1 text-text-primary",
                        !locked && "hover:bg-surface-secondary",
                      )}
                    >
                      <label
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2",
                          locked
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-[13px] w-[13px] cursor-pointer accent-brand"
                          checked={checked}
                          disabled={locked}
                          onChange={() => onToggle(option.key)}
                        />
                        <span className="truncate" title={option.label}>
                          {option.label}
                        </span>
                      </label>

                      {showFreeze ? (
                        <button
                          type="button"
                          aria-label={
                            isFreezeEdge
                              ? t("unfreeze", { column: option.label })
                              : t("freeze", { column: option.label })
                          }
                          aria-pressed={frozen}
                          title={
                            isFreezeEdge
                              ? t("unfreeze", { column: option.label })
                              : t("freeze", { column: option.label })
                          }
                          disabled={!checked}
                          className={cn(
                            "shrink-0 rounded p-0.5 transition-colors",
                            checked
                              ? "cursor-pointer hover:bg-black/5"
                              : "cursor-not-allowed opacity-40",
                            frozen
                              ? "text-brand"
                              : "text-text-secondary opacity-0 group-hover/column:opacity-100 focus:opacity-100",
                          )}
                          onClick={() =>
                            onFreeze?.(isFreezeEdge ? null : option.key)
                          }
                        >
                          <Icon
                            name={frozen ? "pin-filled" : "pin"}
                            size={13}
                          />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border-tertiary px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={hiddenCount === 0}
                    className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-[11px] font-medium text-brand transition-colors hover:bg-brand/10 disabled:cursor-default disabled:text-text-secondary disabled:opacity-50 disabled:hover:bg-transparent"
                    onClick={onShowAll}
                  >
                    <Icon name="eye" size={12} />
                    {t("showAll")}
                  </button>
                  <span aria-hidden className="h-3 w-px bg-border-tertiary" />
                  <button
                    type="button"
                    // The first column stays: a table stripped of every data column would give
                    // the reader nothing to read, which is the same rule the ticks follow.
                    disabled={isLastVisible}
                    title={t("hideAllHint")}
                    className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-[11px] font-medium text-brand transition-colors hover:bg-brand/10 disabled:cursor-default disabled:text-text-secondary disabled:opacity-50 disabled:hover:bg-transparent"
                    onClick={onHideAll}
                  >
                    <Icon name="eye-off" size={12} />
                    {t("hideAll")}
                  </button>
                </div>
                <button
                  type="button"
                  className="cursor-pointer whitespace-nowrap rounded-md bg-brand px-3 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                  onClick={() => setOpen(false)}
                >
                  {t("close")}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
