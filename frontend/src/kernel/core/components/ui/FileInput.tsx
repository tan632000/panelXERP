"use client";

import React, { useRef } from "react";

import { cn } from "@kernel/core/lib/cn";

import { Icon } from "@/kernel/core/components/ui/Icon";

export interface FileInputProps {
  /** Text on the picker button. */
  chooseLabel: string;
  /** Text shown while nothing is picked. */
  emptyLabel: string;
  /** Name of the currently picked or already stored file. */
  fileName?: string | null;
  /** `accept` attribute, e.g. `.pdf,.docx`. */
  accept?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  className?: string;
  /**
   * Called with the picked file. Validation stays with the caller so accept-or-reject lives
   * in one place per feature.
   */
  onPick: (file: File) => void;
  /**
   * Set to make a picked file removable. The control then shows the file name with a clear
   * button in place of the picker, because a field holding a file is answered: what is left
   * to do with it is drop it or replace it. Omitted keeps the picker beside the name.
   */
  onClear?: () => void;
  /** Accessible name of the clear button; required whenever `onClear` is set. */
  clearLabel?: string;
}

/**
 * Bare file picker: a button plus the picked file name, for use inside `FormControl`.
 *
 * Labels arrive as props rather than being translated here, so the component carries no
 * feature vocabulary.
 */
export function FileInput({
  chooseLabel,
  emptyLabel,
  fileName,
  accept,
  disabled = false,
  error = false,
  id,
  className,
  onPick,
  onClear,
  clearLabel,
}: Readonly<FileInputProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showPicked = Boolean(onClear && fileName);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showPicked ? (
        <span
          className={cn(
            "inline-flex h-[38px] min-w-0 items-center gap-1.5 rounded-md border border-border-secondary bg-surface-secondary px-2.5 text-[11px] text-text-secondary",
            error && "border-danger-text",
          )}
        >
          {/* Replacing is picking again, so the name itself reopens the file dialog. */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "min-w-0 max-w-[120px] truncate bg-transparent text-left",
              disabled
                ? "cursor-not-allowed"
                : "cursor-pointer hover:underline",
            )}
            title={fileName ?? undefined}
          >
            {fileName}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            aria-label={clearLabel}
            className={cn(
              "shrink-0 text-text-tertiary transition-colors",
              disabled
                ? "cursor-not-allowed"
                : "cursor-pointer hover:text-danger-text",
            )}
          >
            <Icon name="x" size={14} />
          </button>
        </span>
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "inline-flex h-[38px] items-center gap-1.5 rounded-md border bg-surface-primary px-2.5 text-[13px] transition-colors",
              disabled
                ? "cursor-not-allowed border-border-secondary text-text-tertiary"
                : "cursor-pointer border-border-secondary text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
              error && "border-danger-text",
            )}
          >
            <Icon name="upload" size={15} />
            {chooseLabel}
          </button>
          <span className="min-w-0 truncate text-[11px] text-text-secondary">
            {fileName || emptyLabel}
          </span>
        </>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="hidden"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          // Cleared so picking the same file twice still fires a change.
          event.target.value = "";
        }}
      />
    </div>
  );
}
