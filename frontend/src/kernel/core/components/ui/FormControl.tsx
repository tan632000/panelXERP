"use client";

import React from "react";

import { FORM_LABEL_TEXT_CLASS } from "@kernel/core/components/ui/form-label-styles";
import { cn } from "@kernel/core/lib/cn";

export interface FormControlProps {
  label: string;
  required?: boolean;
  span2?: boolean;
  error?: string;
  className?: string;
  /** The control itself — a picker field, a date input, anything not a plain `<input>`. */
  children: React.ReactNode;
}

/**
 * Label, required marker and error line around a control this module does not own.
 *
 * `FormInput` and `FormSelect` render their own control; a reference field that opens a
 * search popup renders itself, and needs only the frame around it.
 */
export function FormControl({
  label,
  required,
  span2,
  error,
  className,
  children,
}: Readonly<FormControlProps>) {
  return (
    <div
      className={cn("flex flex-col gap-1", span2 && "col-span-2", className)}
      /* Marks a control this module does not own — a record picker, a composite — as invalid,
         so the first bad field can be found even when it has no input of its own. */
      data-invalid={error ? true : undefined}
    >
      <div className={`text-sm ${FORM_LABEL_TEXT_CLASS}`}>
        {label}
        {required && <span className="text-danger-text"> *</span>}
      </div>
      {children}
      {error ? (
        <span className="mt-0.5 text-xs text-danger-text">{error}</span>
      ) : null}
    </div>
  );
}
