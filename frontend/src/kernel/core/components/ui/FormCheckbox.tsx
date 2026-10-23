"use client";

import React from "react";

import { FORM_LABEL_TEXT_CLASS } from "@/kernel/core/components/ui/form-label-styles";
import { cn } from "@/kernel/core/lib/cn";

export interface FormCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
  hint?: string;
}

/**
 * Single boolean flag rendered as a labelled checkbox.
 *
 * Core carries no checkbox control while several document forms need one boolean flag, so
 * this is the shared generic: the label, the checked state and the change handler arrive as
 * props and no feature wording lives here. It fills one grid cell, centring on the control
 * height of the input beside it.
 */
export function FormCheckbox({
  label,
  checked,
  onChange,
  disabled = false,
  error,
  className = "",
  hint,
}: Readonly<FormCheckboxProps>) {
  return (
    <div
      className={cn("flex flex-col justify-end gap-1", className)}
      data-invalid={error ? true : undefined}
    >
      <label
        className={cn(
          `inline-flex min-h-[38px] w-fit cursor-pointer items-center gap-2 text-sm ${FORM_LABEL_TEXT_CLASS}`,
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          type="checkbox"
          className="h-[15px] w-[15px] cursor-pointer accent-brand"
          checked={checked}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <span className="mt-0.5 text-xs text-danger-text">{error}</span>
      ) : null}
      {!error && hint ? (
        <span className="mt-0.5 text-xs text-text-tertiary">{hint}</span>
      ) : null}
    </div>
  );
}
