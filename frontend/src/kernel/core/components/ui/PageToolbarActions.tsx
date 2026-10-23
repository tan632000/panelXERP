"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";
import { toast } from "@/kernel/core/lib/toast";

export interface PageToolbarActionsProps {
  addButtonLabel?: string;
  onAddClick?: () => void;
  showExport?: boolean;
  /** Overrides the shared "Export Excel" caption where a screen's spec names it differently. */
  exportLabel?: string;
  onExportClick?: () => void;
  /** Greys out export while a previous export of the same list is still running. */
  exportDisabled?: boolean;
  showImport?: boolean;
  onImportClick?: () => void;
  actions?: React.ReactNode;
}

/**
 * A desktop draws every button 36px high. A tablet keeps the captions on 40px buttons, which
 * its width has room for. A phone draws them as 40px icons — its own and a screen's `actions`
 * alike — with the caption kept as the tooltip, so they share the row under the keyword box
 * with the "Filters" button. The add button keeps its caption down to a tablet, and only the
 * narrowest phone draws it as its icon, the caption kept as its tooltip.
 */
const BUTTONS = cn(
  "lg:[&>button]:h-9 lg:[&>button]:py-0 lg:[&>*>button]:h-9 lg:[&>*>button]:py-0",
  "max-lg:[&>button]:h-10 max-lg:[&>button]:px-3 max-lg:[&>*>button]:h-10 max-lg:[&>*>button]:px-3",
  "max-md:[&>button:not([data-toolbar-add])]:size-10 max-md:[&>button:not([data-toolbar-add])]:justify-center max-md:[&>button:not([data-toolbar-add])]:gap-0 max-md:[&>button:not([data-toolbar-add])]:p-0 max-md:[&>button:not([data-toolbar-add])]:text-[0px]",
  "max-md:[&>*>button]:size-10 max-md:[&>*>button]:justify-center max-md:[&>*>button]:gap-0 max-md:[&>*>button]:p-0 max-md:[&>*>button]:text-[0px]",
);

const TOOLBAR_BUTTON =
  "inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-border-secondary bg-surface-primary h-9 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:cursor-default disabled:opacity-50 [font-family:inherit]";

const MENU_ITEM =
  "flex w-full cursor-pointer items-center gap-2 whitespace-nowrap border-none bg-transparent px-3.5 py-2 text-left text-sm text-text-primary [font-family:inherit] hover:bg-surface-secondary disabled:cursor-default disabled:opacity-50";

/**
 * The file actions sit in one "Excel" button's menu — export, and import where the screen has
 * it — so every toolbar spends one slot on them and they look the same on every list.
 */
function ExcelMenu({
  exportLabel,
  exportDisabled,
  onExport,
  showImport,
  onImport,
}: Readonly<{
  exportLabel: string;
  exportDisabled: boolean;
  onExport: () => void;
  showImport: boolean;
  onImport?: () => void;
}>) {
  const t = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const choose = (action?: () => void) => {
    setOpen(false);
    action?.();
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        title={t("excelMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        {/* Excel's own green, so the file actions read as Excel at a glance. */}
        <Icon name="file-type-xls" size={18} className="text-[#107C41]" />
        {t("excelMenu")}
        <Icon
          name="chevron-down"
          size={14}
          className={cn(
            "transition-transform duration-150 max-md:hidden",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[180px] rounded-lg border border-border-secondary bg-surface-primary py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        >
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            disabled={exportDisabled}
            onClick={() => choose(onExport)}
          >
            <Icon name="download" size={16} />
            {exportLabel}
          </button>
          {showImport ? (
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM}
              onClick={() => choose(onImport)}
            >
              <Icon name="upload" size={16} />
              {t("importExcel")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PageToolbarActions({
  addButtonLabel,
  onAddClick,
  showExport = true,
  exportLabel,
  onExportClick,
  exportDisabled = false,
  showImport = false,
  onImportClick,
  actions,
}: PageToolbarActionsProps) {
  const t = useTranslations("common");

  const containerRef = React.useRef<HTMLDivElement>(null);

  // A button a phone shows as a bare icon keeps its caption as the tooltip.
  React.useEffect(() => {
    containerRef.current?.querySelectorAll("button").forEach((button) => {
      const caption = button.textContent?.trim();
      if (caption && !button.title) button.title = caption;
    });
  });

  const hasActions =
    actions || showImport || showExport || (addButtonLabel && onAddClick);

  if (!hasActions) return null;

  const handleExport = () => {
    if (onExportClick) {
      onExportClick();
    } else {
      toast.showSuccess(t("exportSuccess"));
    }
  };

  return (
    <div
      ref={containerRef}
      data-toolbar-actions
      className={cn("ml-auto flex shrink-0 items-center gap-[7px]", BUTTONS)}
    >
      {actions}
      {showExport ? (
        <ExcelMenu
          exportLabel={exportLabel ?? t("exportExcel")}
          exportDisabled={exportDisabled}
          onExport={handleExport}
          showImport={showImport}
          onImport={onImportClick}
        />
      ) : null}
      {showImport && !showExport && (
        <button
          type="button"
          className={TOOLBAR_BUTTON}
          onClick={onImportClick}
        >
          <Icon name="upload" size={16} /> {t("importExcel")}
        </button>
      )}
      {addButtonLabel && onAddClick && (
        <button
          type="button"
          data-toolbar-add
          className="inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-brand bg-brand h-9 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-default disabled:opacity-50 max-sm:px-2.5 [font-family:inherit]"
          title={addButtonLabel}
          onClick={onAddClick}
        >
          <Icon name="plus" size={16} />
          {/* A phone shows the plus alone; the label stays for screen readers and the tooltip. */}
          <span className="max-sm:sr-only">{addButtonLabel}</span>
        </button>
      )}
    </div>
  );
}
