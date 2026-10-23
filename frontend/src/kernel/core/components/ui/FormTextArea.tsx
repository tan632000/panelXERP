"use client";

import React from "react";

import { FORM_LABEL_TEXT_CLASS } from "@kernel/core/components/ui/form-label-styles";
import { cn } from "@kernel/core/lib/cn";

import type { TextareaHTMLAttributes } from "react";

export interface FormTextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  /**
   * Hides the label visually while keeping it for assistive technology.
   *
   * For a row of a line editor, where one header row already names every column and
   * repeating the label in each cell would be noise on screen but is still the only thing
   * naming the control to a screen reader.
   */
  labelHidden?: boolean;
  required?: boolean;
  span2?: boolean;
  error?: string;
}

export function FormTextArea({
  label,
  labelHidden,
  required,
  span2,
  className = "",
  error,
  ...props
}: FormTextAreaProps) {
  return (
    <div
      className={cn("flex flex-col gap-1", span2 && "col-span-2", className)}
    >
      <div
        className={cn(
          `text-sm ${FORM_LABEL_TEXT_CLASS}`,
          labelHidden && "sr-only",
        )}
      >
        {label}
        {required && <span className="text-danger-text"> *</span>}
      </div>
      <textarea
        className={cn(
          "w-full rounded-md border border-border-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none transition-[border,box-shadow] focus:border-brand focus:shadow-[0_0_0_2px_rgba(26,42,94,0.07)] [font-family:inherit]",
          "min-h-[55px] resize-y",
          error && "border-danger-text focus:border-danger-text",
        )}
        {...props}
        // Keep asterisk via `required` prop; do not use HTML5 required (blocks RHF/Zod)
        required={false}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
      />
      {error && (
        <span className="text-xs text-danger-text mt-0.5">{error}</span>
      )}
    </div>
  );
}
