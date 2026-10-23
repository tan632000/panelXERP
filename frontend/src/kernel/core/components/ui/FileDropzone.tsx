"use client";

import React, { useRef, useState } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

export interface FileDropzoneProps {
  /** `accept` attribute, e.g. `.xlsx`; also used to judge a dropped file client-side. */
  accept: string;
  maxBytes?: number;
  disabled?: boolean;
  title: string;
  subtitle: string;
  hint: string;
  invalidTypeMessage: string;
  tooLargeMessage: string;
  onFile: (file: File) => void;
  className?: string;
}

function matchesAccept(fileName: string, accept: string): boolean {
  const lower = fileName.toLowerCase();
  return accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((extension) => lower.endsWith(extension));
}

/**
 * A click-or-drag file target. Validation (extension, size) runs here so a rejected file never
 * reaches the caller's `onFile` and never fires a request; the caller only ever receives a file
 * worth uploading.
 *
 * The drag-over state is tracked with a counter rather than a boolean, because a dropzone with
 * children fires `dragleave` for every child boundary the pointer crosses — a plain boolean
 * would flicker the highlight off and on as the pointer moves over the icon and text inside it.
 */
export function FileDropzone({
  accept,
  maxBytes,
  disabled = false,
  title,
  subtitle,
  hint,
  invalidTypeMessage,
  tooLargeMessage,
  onFile,
  className,
}: Readonly<FileDropzoneProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    if (!matchesAccept(file.name, accept)) {
      setError(invalidTypeMessage);
      return;
    }
    if (maxBytes !== undefined && file.size > maxBytes) {
      setError(tooLargeMessage);
      return;
    }
    setError(null);
    onFile(file);
  };

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled) return;
          dragDepth.current += 1;
          setIsDragOver(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          if (disabled) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled) return;
          dragDepth.current = 0;
          setIsDragOver(false);
          acceptFile(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex h-40 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 text-center outline-none transition-colors",
          disabled
            ? "cursor-not-allowed border-border-secondary bg-surface-secondary opacity-50"
            : "cursor-pointer border-border-secondary bg-surface-secondary hover:bg-surface-tertiary focus-visible:border-brand",
          isDragOver && !disabled && "border-brand bg-brand-light",
        )}
      >
        <Icon name="upload" size={28} className="text-text-secondary" />
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary">{subtitle}</p>
        <p className="text-[11px] text-text-tertiary">{hint}</p>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-danger-text">{error}</p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          acceptFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
