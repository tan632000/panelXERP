"use client";

import React, { useRef } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

/** One file the control lists — already stored or just picked. */
export interface MultiFileInputItem {
  /** Stable key the removal is reported by. */
  key: string;
  name: string;
  /** Pre-formatted size, e.g. "2.4 MB"; omitted when unknown. */
  sizeLabel?: string;
}

export interface MultiFileInputProps {
  items: readonly MultiFileInputItem[];
  /** Text on the picker button. */
  chooseLabel: string;
  /** Shown while the list is empty. */
  emptyLabel: string;
  /** Accessible name of each row's remove button. */
  removeLabel: string;
  /** `accept` attribute, e.g. `.pdf,.docx`. */
  accept?: string;
  /** Disables picking only; listed files stay removable unless `readOnly`. */
  disabled?: boolean;
  /** Hides every control and shows the list alone. */
  readOnly?: boolean;
  error?: boolean;
  /** A line under the list, such as the space used. */
  footer?: React.ReactNode;
  className?: string;
  /** Called once per picked file; validation stays with the caller. */
  onPick: (file: File) => void;
  onRemove: (key: string) => void;
}

/**
 * A file list that grows one pick at a time, each row removable on its own.
 *
 * Labels arrive as props, so the component carries no feature vocabulary. `FileInput` is the
 * single-file twin; this one exists for a slot that holds any number of files.
 */
export function MultiFileInput({
  items,
  chooseLabel,
  emptyLabel,
  removeLabel,
  accept,
  disabled = false,
  readOnly = false,
  error = false,
  footer,
  className,
  onPick,
  onRemove,
}: Readonly<MultiFileInputProps>) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.key}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-md border border-border-secondary bg-surface-secondary px-2.5 py-1 text-[12px] text-text-secondary",
                error && "border-danger-text",
              )}
            >
              <Icon name="paperclip" size={13} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate" title={item.name}>
                {item.name}
              </span>
              {item.sizeLabel ? (
                <span className="shrink-0 text-text-tertiary">
                  {item.sizeLabel}
                </span>
              ) : null}
              {readOnly ? null : (
                <button
                  type="button"
                  onClick={() => onRemove(item.key)}
                  aria-label={removeLabel}
                  title={removeLabel}
                  className="shrink-0 cursor-pointer text-text-tertiary transition-colors hover:text-danger-text"
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[11px] text-text-secondary">{emptyLabel}</span>
      )}

      {readOnly ? null : (
        <div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "inline-flex h-[34px] items-center gap-1.5 rounded-md border bg-surface-primary px-2.5 text-[13px] transition-colors",
              disabled
                ? "cursor-not-allowed border-border-secondary text-text-tertiary"
                : "cursor-pointer border-border-secondary text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
              error && "border-danger-text",
            )}
          >
            <Icon name="upload" size={15} />
            {chooseLabel}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept={accept}
            disabled={disabled}
            onChange={(event) => {
              for (const file of Array.from(event.target.files ?? [])) {
                onPick(file);
              }
              // Cleared so picking the same file twice still fires a change.
              event.target.value = "";
            }}
          />
        </div>
      )}

      {footer ? (
        <div className="text-[11px] text-text-tertiary">{footer}</div>
      ) : null}
    </div>
  );
}
